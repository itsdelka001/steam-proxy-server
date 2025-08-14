const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const app = express();
const port = process.env.PORT || 3001;

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
      // Дозволити запити без Origin (наприклад, від Postman)
      callback(null, true);
      return;
    }

    // Перевірити, чи origin відповідає дозволеним шаблонам
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
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
  const cdnHosts = [
    'https://steamcommunity-a.akamaihd.net/economy/image/',
    'https://community.cloudflare.steamstatic.com/economy/image/'
  ];
  return cdnHosts[0] + iconUrl;
}

// API для інвестицій
app.get('/api/investments', async (req, res) => {
  try {
    const investmentsRef = db.collection('investments');
    const snapshot = await investmentsRef.get();
    const investments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.status(200).json(investments);
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).send('Error fetching data');
  }
});

app.post('/api/investments', async (req, res) => {
  try {
    const newItem = req.body;
    const docRef = await db.collection('investments').add(newItem);
    res.status(201).json({ id: docRef.id, message: 'Investment added successfully' });
  } catch (error) {
    console.error('Error adding investment:', error);
    res.status(500).send('Error adding data');
  }
});

app.put('/api/investments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const investmentDocRef = db.collection('investments').doc(id);
    await investmentDocRef.update(updatedData);
    res.status(200).json({ id, message: 'Investment updated successfully' });
  } catch (error) {
    console.error('Error updating investment:', error);
    res.status(500).send('Error updating data');
  }
});

app.delete('/api/investments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const investmentDocRef = db.collection('investments').doc(id);
    await investmentDocRef.delete();
    res.status(200).json({ id, message: 'Investment deleted successfully' });
  } catch (error) {
    console.error('Error deleting investment:', error);
    res.status(500).send('Error deleting data');
  }
});

// Steam API Proxy
app.get('/search', async (req, res) => {
  const { query, game } = req.query;
  if (!query || !game) {
    return res.status(400).json({ error: 'Query and game are required' });
  }

  const appId = APP_IDS[game.toLowerCase()];
  if (!appId) {
    return res.status(400).json({ error: 'Invalid game specified' });
  }

  const url = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(query)}&start=0&count=10&search_descriptions=0&sort_column=default&sort_dir=desc&appid=${appId}&norender=1`;
  
  // ---> ЛОГУВАННЯ: Відправка запиту на пошук
  console.log(`[LOG] Відправка запиту на пошук Steam: ${url}`);

  try {
    const response = await fetch(url, { headers: defaultHeaders });
    
    // ---> ЛОГУВАННЯ: Статус відповіді
    console.log(`[LOG] Відповідь від Steam Search API, статус: ${response.status}`);

    const data = await response.json();
    if (!data.success) {
      // ---> ЛОГУВАННЯ: Помилка Steam API
      console.error(`[ERROR] Steam API повернув помилку пошуку:`, data);
      return res.status(500).json({ error: 'Steam API error', steamData: data });
    }
    const items = data.results.map(item => ({
      name: item.name,
      market_hash_name: item.market_hash_name,
      icon_url: buildImageUrl(item.asset_description.icon_url)
    }));
    res.json(items);
  } catch (error) {
    // ---> ЛОГУВАННЯ: Виняток під час запиту
    console.error('Error fetching data from Steam:', error);
    res.status(500).json({ error: 'Failed to fetch data from Steam' });
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
  
  // ---> ЛОГУВАННЯ: Відправка запиту на ціну
  console.log(`[LOG] Відправка запиту на ціну Steam: ${url}`);

  try {
    const response = await fetch(url, { headers: defaultHeaders });
    
    // ---> ЛОГУВАННЯ: Статус відповіді
    console.log(`[LOG] Відповідь від Steam Price API, статус: ${response.status}`);

    // Перевірка на обмеження запитів
    if (response.status === 429) {
      console.error(`[ERROR] Steam API Rate Limit Exceeded: забагато запитів!`);
      return res.status(429).json({ error: 'Too Many Requests to Steam API' });
    }

    const data = await response.json();

    if (!data.success) {
      // ---> ЛОГУВАННЯ: Помилка Steam API
      console.error(`[ERROR] Steam API повернув помилку ціни:`, data);
      return res.status(500).json({ error: 'Steam API error', steamData: data });
    }

    const price = parseFloat(data.median_price.replace(',', '.').replace(/[^\d.]/g, ''));
    res.json({ price });
  } catch (error) {
    // ---> ЛОГУВАННЯ: Виняток під час запиту
    console.error('Error fetching price from Steam:', error);
    res.status(500).json({ error: 'Failed to fetch price from Steam' });
  }
});

// ---> НОВИЙ МАРШРУТ для історії ціни
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
  
  console.log(`[LOG] Відправка запиту на історію ціни Steam: ${url}`);

  try {
    const response = await fetch(url, { headers: defaultHeaders });

    console.log(`[LOG] Відповідь від Steam Price History API, статус: ${response.status}`);

    if (response.status === 429) {
      console.error(`[ERROR] Steam API Rate Limit Exceeded: забагато запитів!`);
      return res.status(429).json({ success: false, error: 'Too Many Requests to Steam API' });
    }
    
    // Додаємо перевірку на статус 400 Bad Request
    if (response.status === 400) {
      console.error(`[ERROR] Steam API повернув помилку 400 Bad Request. Можливо, для цього предмета немає історії цін.`);
      return res.status(400).json({ success: false, error: 'Bad request to Steam API, check item name or if price history exists' });
    }
    
    // Перевірка, чи є відповідь успішною, інакше обробляємо як помилку
    if (!response.ok) {
        console.error(`[ERROR] Помилка HTTP від Steam API зі статусом: ${response.status}`);
        return res.status(response.status).json({ success: false, error: `HTTP Error from Steam: ${response.status}` });
    }

    // Спробуємо отримати JSON, якщо не вдається - обробляємо виняток
    const textData = await response.text();
    let data;
    try {
        // Усуваємо потенційну BOM-позначку
        data = JSON.parse(textData.trim().replace(/^\ufeff/,""));
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
    console.error('Error fetching price history from Steam:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch price history from Steam' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at port ${port}`);
});