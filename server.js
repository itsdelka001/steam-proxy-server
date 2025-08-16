const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

const DMARKET_PUBLIC_KEY = process.env.DMARKET_PUBLIC_KEY;
const DMARKET_SECRET_KEY = process.env.DMARKET_SECRET_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const SKINPORT_CLIENT_ID = process.env.SKINPORT_CLIENT_ID;
const SKINPORT_CLIENT_SECRET = process.env.SKINPORT_CLIENT_SECRET;


if (!DMARKET_PUBLIC_KEY || !DMARKET_SECRET_KEY || !STEAM_API_KEY) {
    console.warn("WARNING: One or more API keys (DMarket, Steam) are not defined in environment variables. Some functionality may not work.");
}
if (!SKINPORT_CLIENT_ID || !SKINPORT_CLIENT_SECRET) {
    console.warn("WARNING: Skinport API keys are not defined. Skinport functionality will be disabled.");
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error.message);
  console.error("Please ensure the FIREBASE_ADMIN_CREDENTIALS environment variable is set correctly.");
}

const db = admin.firestore();

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://steam-investment-app-frontend.vercel.app',
  /^https:\/\/steam-investment-app-frontend-[a-z0-9]+-itsdelka001s-projects\.vercel\.app$/
];

app.use(cors({ origin: allowedOrigins, credentials: true }));


app.use(express.json());

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};

const APP_IDS = {
  'cs2': 730,
  'dota 2': 570,
  'pubg': 578080
};

function buildImageUrl(iconUrl) {
  if (!iconUrl) return null;
  return 'https://steamcommunity-a.akamaihd.net/economy/image/' + iconUrl;
}

// --- ДОПОМІЖНІ ФУНКЦІЇ ДЛЯ РОБОТИ З API ---

async function dmarketRequest(method, fullUrl) {
    if (!DMARKET_PUBLIC_KEY || !DMARKET_SECRET_KEY) {
        throw new Error('DMarket API keys are not configured on the server.');
    }
    const url = new URL(fullUrl);
    const timestamp = Math.floor(Date.now() / 1000);
    const stringToSign = `${method}${url.pathname}${url.search}${''}${timestamp}`;
    const signature = crypto.createHmac('sha256', DMARKET_SECRET_KEY).update(stringToSign).digest('hex');

    const response = await fetch(url.toString(), {
        method: method,
        headers: {
            'X-Api-Key': DMARKET_PUBLIC_KEY,
            'X-Request-Sign': `dmar ed25519 ${signature}`,
            'X-Sign-Date': timestamp,
        }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DMarket API error: ${response.status} ${errorBody}`);
    }
    return response.json();
}

async function getSteamPrice(itemName, game) {
    const appId = APP_IDS[game.toLowerCase()];
    if (!appId) return { price: 0 };
    
    const url = `https://steamcommunity.com/market/priceoverview/?currency=1&appid=${appId}&market_hash_name=${encodeURIComponent(itemName)}`;
    try {
        await new Promise(resolve => setTimeout(resolve, 300));
        const response = await fetch(url, { headers: defaultHeaders });
        if (!response.ok) return { price: 0 };
        const data = await response.json();
        if (!data.success) return { price: 0 };
        
        const priceString = data.lowest_price || data.median_price || "$0.00 USD";
        const price = parseFloat(priceString.replace('$', '').replace(' USD', '').trim());
        return { price };
    } catch (error) {
        console.error(`Failed to fetch Steam price for ${itemName}:`, error);
        return { price: 0 };
    }
}

// --- ІНТЕГРОВАНО ВИПРАВЛЕННЯ: Додано заголовок 'Accept-Encoding' ---
async function skinportRequest(url) {
    if (!SKINPORT_CLIENT_ID || !SKINPORT_CLIENT_SECRET) {
        throw new Error('Skinport API keys are not configured.');
    }
    const response = await fetch(url, {
        headers: {
            'Authorization': 'Basic ' + Buffer.from(SKINPORT_CLIENT_ID + ':' + SKINPORT_CLIENT_SECRET).toString('base64'),
            'Accept-Encoding': 'gzip, deflate, br'
        }
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Skinport API error: ${response.status} ${errorBody}`);
    }
    return response.json();
}


// --- ОНОВЛЕНИЙ УНІВЕРСАЛЬНИЙ МАРШРУТ ДЛЯ АРБІТРАЖУ ---
app.get('/api/arbitrage-opportunities', async (req, res) => {
    // ІНТЕГРОВАНО: Приймаємо ліміт з фронтенду, за замовчуванням 200
    const { source, destination, gameId = 'a8db', limit = 100, currency = 'USD' } = req.query;

    try {
        let opportunities = [];
        if (source === 'Steam' && destination === 'DMarket') {
            // ІНТЕГРОВАНО ВИПРАВЛЕННЯ: DMarket не приймає ліміт більше 100
            const dmarketLimit = Math.min(limit, 100);
            const dmarketUrl = `https://api.dmarket.com/exchange/v1/market/items?gameId=${gameId}&limit=${dmarketLimit}&currency=${currency}&orderBy=price&orderDir=asc`;
            const dmarketResponse = await dmarketRequest('GET', dmarketUrl);
            
            if (!dmarketResponse.objects || dmarketResponse.objects.length === 0) return res.json([]);

            const items = await Promise.all(
                dmarketResponse.objects.map(async (item) => {
                    const steamPriceData = await getSteamPrice(item.title, 'cs2');
                    const destPrice = parseFloat(item.price[currency]) / 100;
                    const sourcePrice = steamPriceData.price;
                    // ІНТЕГРОВАНО: Забираємо фільтр, щоб бачити більше варіантів
                    if (sourcePrice === 0) return null;
                    return { id: item.itemId, name: item.title, image: item.image, sourceMarket: 'Steam', sourcePrice, destMarket: 'DMarket', destPrice, fees: destPrice * 0.07 };
                })
            );
            opportunities = items.filter(op => op !== null);
        } else if (source === 'DMarket' && destination === 'Steam') {
            const dmarketLimit = Math.min(limit, 100);
            const dmarketUrl = `https://api.dmarket.com/exchange/v1/market/items?gameId=${gameId}&limit=${dmarketLimit}&currency=${currency}&orderBy=price&orderDir=asc`;
            const dmarketResponse = await dmarketRequest('GET', dmarketUrl);
            if (!dmarketResponse.objects || dmarketResponse.objects.length === 0) return res.json([]);

            const items = await Promise.all(
                dmarketResponse.objects.map(async (item) => {
                    const steamPriceData = await getSteamPrice(item.title, 'cs2');
                    const sourcePrice = parseFloat(item.price[currency]) / 100;
                    const destPrice = steamPriceData.price;
                    if (destPrice === 0) return null;
                    return { id: item.itemId, name: item.title, image: item.image, sourceMarket: 'DMarket', sourcePrice, destMarket: 'Steam', destPrice, fees: destPrice * 0.15 };
                })
            );
            opportunities = items.filter(op => op !== null);
        } else if (source === 'Steam' && destination === 'Skinport') {
            // ІНТЕГРОВАНО ВИПРАВЛЕННЯ: Skinport не приймає параметри сортування та ліміту в цьому ендпоінті
            const skinportUrl = `https://api.skinport.com/v1/items?app_id=730&currency=USD`;
            const skinportResponse = await skinportRequest(skinportUrl);
            if (!skinportResponse || skinportResponse.length === 0) return res.json([]);

            // Обмежуємо кількість на сервері, оскільки API віддає все
            const limitedResponse = skinportResponse.slice(0, limit);

            const items = await Promise.all(
                limitedResponse.map(async (item) => {
                    const steamPriceData = await getSteamPrice(item.market_hash_name, 'cs2');
                    const destPrice = item.min_price / 100;
                    const sourcePrice = steamPriceData.price;
                    if (sourcePrice === 0) return null;
                    return { id: item.item_page, name: item.market_hash_name, image: item.image_url, sourceMarket: 'Steam', sourcePrice, destMarket: 'Skinport', destPrice, fees: destPrice * 0.12 };
                })
            );
            opportunities = items.filter(op => op !== null);
        } else {
            console.log(`Arbitrage path from ${source} to ${destination} is not yet implemented.`);
        }
        res.status(200).json(opportunities);
    } catch (error) {
        console.error(`Error in arbitrage logic for ${source} -> ${destination}:`, error);
        res.status(500).json({ error: "Failed to process arbitrage opportunities" });
    }
});


// --- ІСНУЮЧІ МАРШРУТИ (БЕЗ ЗМІН) ---
app.get('/api/investments', async (req, res) => {
  try {
    const investmentsRef = db.collection('investments');
    const snapshot = await investmentsRef.get();
    const investments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(investments);
  } catch (error) {
    console.error("Error fetching investments:", error);
    res.status(500).send('Error fetching data from Firestore');
  }
});
app.post('/api/investments', async (req, res) => {
  try {
    const newItem = req.body;
    const docRef = await db.collection('investments').add(newItem);
    res.status(201).json({ id: docRef.id });
  } catch (error) {
    console.error("Error adding investment:", error);
    res.status(500).send('Error adding data to Firestore');
  }
});
app.put('/api/investments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    await db.collection('investments').doc(id).update(updatedData);
    res.status(200).json({ id });
  } catch (error) {
    console.error(`Error updating investment ${id}:`, error);
    res.status(500).send('Error updating data in Firestore');
  }
});
app.delete('/api/investments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('investments').doc(id).delete();
    res.status(200).json({ id });
  } catch (error) {
    console.error(`Error deleting investment ${id}:`, error);
    res.status(500).send('Error deleting data from Firestore');
  }
});
app.get('/api/exchange-rates', async (req, res) => {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Exchange rate service is not configured.' });
  }
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/EUR`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.result === 'success') {
      res.status(200).json(data);
    } else {
      console.error("ExchangeRate API error:", data);
      res.status(500).json({ error: 'Failed to retrieve exchange rates.' });
    }
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    res.status(500).json({ error: 'Internal server error while fetching exchange rates.' });
  }
});
app.get('/search', async (req, res) => {
  const { query, game } = req.query;
  const appId = APP_IDS[game.toLowerCase()];
  if (!query || !game || !appId) {
    return res.status(400).json({ error: 'Query and valid game are required' });
  }
  const url = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(query)}&start=0&count=10&search_descriptions=0&sort_column=default&sort_dir=desc&appid=${appId}&norender=1`;
  try {
    const response = await fetch(url, { headers: defaultHeaders });
    const data = await response.json();
    if (!data.success) {
      console.error("Steam search API error:", data);
      return res.status(500).json({ error: 'Steam API error' });
    }
    const items = data.results.map(item => ({
      name: item.name,
      market_hash_name: item.hash_name,
      icon_url: buildImageUrl(item.asset_description.icon_url)
    }));
    res.json(items);
  } catch (error) {
    console.error("Error fetching from Steam search:", error);
    res.status(500).json({ error: 'Failed to fetch from Steam' });
  }
});
app.get('/current_price', async (req, res) => {
    const { item_name, game } = req.query;
    if (!item_name || !game) {
        return res.status(400).json({ error: 'item_name and game are required' });
    }
    const appId = APP_IDS[game.toLowerCase()];
    if (!appId) {
        return res.status(400).json({ error: 'Invalid game specified' });
    }
    const url = `https://steamcommunity.com/market/priceoverview/?currency=3&appid=${appId}&market_hash_name=${encodeURIComponent(item_name)}`;
    try {
        const response = await fetch(url, { headers: defaultHeaders });
        if (response.status === 429) {
            return res.status(429).json({ error: 'Too Many Requests to Steam API' });
        }
        const data = await response.json();
        if (!data.success) {
            console.error("Steam current_price API error:", data);
            return res.status(500).json({ error: 'Steam API error', steamData: data });
        }
        const priceString = data.lowest_price || data.median_price || "0";
        const price = parseFloat(priceString.replace(',', '.').replace(/[^\d.]/g, ''));
        res.json({ price });
    } catch (error) {
        console.error("Error fetching from Steam current_price:", error);
        res.status(500).json({ error: 'Failed to fetch price from Steam' });
    }
});
app.post('/market_analysis', async (req, res) => {
  const { itemName, game } = req.body;
  if (!itemName || !game) {
    return res.status(400).json({ error: 'itemName and game are required' });
  }
  try {
    const analysis = `Аналіз для ${itemName} (${game}):\n- Попит: стабільний\n- Пропозиція: обмежена\n- Тренд ціни: зростаючий\n- Рекомендація: Купувати`;
    res.json({ analysis });
  } catch (error) {
    console.error("Error generating market analysis:", error);
    res.status(500).json({ error: 'Failed to generate market analysis' });
  }
});
app.get('/price_history', async (req, res) => {
    const { item_name, game } = req.query;
    if (!item_name || !game) {
        return res.status(400).json({ error: 'item_name and game are required' });
    }
    const appId = APP_IDS[game.toLowerCase()];
    if (!appId) {
        return res.status(400).json({ error: 'Invalid game specified' });
    }
    const url = `https://steamcommunity.com/market/pricehistory/?currency=3&appid=${appId}&market_hash_name=${encodeURIComponent(item_name)}`;
    
    console.log(`[INFO] Запит історії цін для: ${item_name}`);

    try {
        const response = await fetch(url, { headers: defaultHeaders });
        
        if (!response.ok) {
            console.error(`[ERROR] Помилка HTTP від Steam API зі статусом: ${response.status}`);
            return res.status(response.status).json({ success: false, error: `HTTP Error from Steam: ${response.status}` });
        }

        const textData = await response.text();
        let data;
        try {
            data = JSON.parse(textData.trim().replace(/^\ufeff/, ""));
        } catch (e) {
            console.error(`[ERROR] Неможливо розпарсити JSON-відповідь. Отримано:`, textData.substring(0, 100) + '...');
            return res.status(500).json({ success: false, error: 'Invalid JSON response from Steam API' });
        }

        if (!data.success) {
          console.error(`[ERROR] Steam API повернув помилку історії ціни:`, data);
          return res.status(500).json({ success: false, error: 'Steam API error', steamData: data });
        }

        if (!data.prices) {
            console.warn(`[WARNING] Steam API повернув успішну відповідь, але без даних про ціни.`);
            return res.json({ success: true, prices: [] });
        }
        
        res.json(data);

    } catch (error) {
        console.error(`[ERROR] Критична помилка при запиті історії цін:`, error);
        res.status(500).json({ success: false, error: 'Failed to fetch price history from Steam' });
    }
});


app.listen(port, () => {
  console.log(`Proxy server listening at port ${port}`);
});
