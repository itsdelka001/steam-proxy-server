const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
// --- ДОДАНО: Модуль для криптографії, необхідний для DMarket API ---
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

// --- ДОДАНО: Зчитування ключів DMarket та Steam з середовища ---
const DMARKET_PUBLIC_KEY = process.env.DMARKET_PUBLIC_KEY;
const DMARKET_SECRET_KEY = process.env.DMARKET_SECRET_KEY;
const STEAM_API_KEY = process.env.STEAM_API_KEY; // Ваш існуючий ключ

// --- ДОДАНО: Перевірка наявності ключів при старті ---
if (!DMARKET_PUBLIC_KEY || !DMARKET_SECRET_KEY || !STEAM_API_KEY) {
    console.warn("WARNING: One or more API keys (DMarket, Steam) are not defined in environment variables. Some functionality may not work.");
}

// Ініціалізація Firebase Admin SDK
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

// Логування запитів
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

// Налаштування CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://steam-investment-app-frontend.vercel.app',
  // Регулярний вираз для всіх preview-доменів Vercel
  /^https:\/\/steam-investment-app-frontend-[a-z0-9]+-itsdelka001s-projects\.vercel\.app$/
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return origin === allowed;
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    });
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`CORS error: Origin ${origin} not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

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

// --- ДОДАНО: Маршрут-проксі для DMarket API ---
app.get('/api/dmarket-proxy', async (req, res) => {
    if (!DMARKET_PUBLIC_KEY || !DMARKET_SECRET_KEY) {
        return res.status(500).json({ error: 'DMarket API keys are not configured on the server.' });
    }

    const DMARKET_API_BASE = "https://api.dmarket.com";
    const { path, ...queryParams } = req.query;
    
    if (!path) {
        return res.status(400).json({ error: 'API path is required' });
    }

    const url = new URL(`${DMARKET_API_BASE}${path}`);
    Object.keys(queryParams).forEach(key => url.searchParams.append(key, queryParams[key]));

    const method = 'GET';
    const requestBody = '';
    const timestamp = Math.floor(Date.now() / 1000);
    const stringToSign = `${method}${url.pathname}${url.search}${requestBody}${timestamp}`;

    const signature = crypto
        .createHmac('sha256', DMARKET_SECRET_KEY)
        .update(stringToSign)
        .digest('hex');

    try {
        const response = await fetch(url.toString(), {
            method: method,
            headers: {
                'X-Api-Key': DMARKET_PUBLIC_KEY,
                'X-Request-Sign': `dmar ed25519 ${signature}`,
                'X-Sign-Date': timestamp,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error(`[DMarket Proxy] Error from DMarket API: ${response.status}`, data);
            return res.status(response.status).json(data);
        }

        res.status(200).json(data);

    } catch (error) {
        console.error('[DMarket Proxy] Internal error:', error);
        res.status(500).json({ error: 'Failed to fetch from DMarket API' });
    }
});

// API для інвестицій
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

// API для курсів валют
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

// Steam API Proxy
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
      market_hash_name: item.hash_name, // Corrected from market_hash_name
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
