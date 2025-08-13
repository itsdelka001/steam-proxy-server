const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin'); // ✨ НОВЕ: імпорт Firebase Admin SDK

const app = express();
const port = process.env.PORT || 3001;

// ✨ НОВЕ: Ініціалізація Firebase Admin SDK
// Використовуємо змінну середовища для безпечного зберігання ключа
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
  // Можна залишити сервер працювати для проксі, якщо Firebase не є критичним
}

const db = admin.firestore();
// ✨ КІНЕЦЬ НОВОГО БЛОКУ

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://steam-investment-app-frontend.vercel.app',
  'https://steam-investment-app-frontend-l7d916yuv-itsdelka001s-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS error: Origin ${origin} not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  }
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

// ✨ НОВІ API маршрути для роботи з Firestore
// Отримання всіх інвестицій
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

// Додавання нової інвестиції
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

// Оновлення інвестиції за ID
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

// Видалення інвестиції за ID
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

// ✨ КІНЕЦЬ НОВОГО БЛОКУ

// ✨ ТВОЇ ІСНУЮЧІ API маршрути для Steam Market
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

  try {
    const response = await fetch(url, { headers: defaultHeaders });
    const data = await response.json();
    if (!data.success) {
      return res.status(500).json({ error: 'Steam API error', steamData: data });
    }
    const items = data.results.map(item => ({
      name: item.name,
      market_hash_name: item.market_hash_name,
      icon_url: buildImageUrl(item.asset_description.icon_url)
    }));
    res.json(items);
  } catch (error) {
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

  try {
    const response = await fetch(url, { headers: defaultHeaders });
    const data = await response.json();

    if (!data.success) {
      return res.status(500).json({ error: 'Steam API error', steamData: data });
    }

    const price = parseFloat(data.median_price.replace(',', '.').replace(/[^\d.]/g, ''));
    res.json({ price });
  } catch (error) {
    console.error('Error fetching price from Steam:', error);
    res.status(500).json({ error: 'Failed to fetch price from Steam' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at port ${port}`);
});