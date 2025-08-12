// server.js - Оновлений проксі-сервер з динамічним пошуком
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

// Оновлюємо дозволені джерела, як ми раніше обговорювали
const allowedOrigins = [
  'http://localhost:3000',
  'https://steam-investment-app-frontend.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// API-ключ Steam отримуємо зі змінних середовища
const STEAM_API_KEY = process.env.STEAM_API_KEY;

if (!STEAM_API_KEY) {
  console.error('STEAM_API_KEY is not set. Please set it as an environment variable.');
  process.exit(1);
}

// Оновлена функція для пошуку предметів на ринку Steam
app.get('/search', async (req, res) => {
  const query = req.query.query;
  const game = req.query.game; // Тепер ми можемо використовувати гру для фільтрації
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  // Отримання AppID для вибраної гри
  let appId;
  if (game === 'CS2') {
    appId = 730;
  } else if (game === 'Dota 2') {
    appId = 570;
  } else {
    appId = 730; // За замовчуванням CS2
  }

  try {
    // Використовуємо офіційний API Steam Community Market для пошуку
    const apiUrl = `https://steamcommunity.com/market/search/render?query=${encodeURIComponent(query)}&appid=${appId}&norender=1&count=10`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.results) {
      // Мапуємо результати API до формату, який очікує ваш фронтенд
      const items = data.results.map(item => ({
        label: item.market_hash_name, // Назва предмета
        value: item.market_hash_name,
        image: item.asset_description.icon_url, // URL-адреса фото
        // Ви можете додати більше полів, якщо потрібно
      }));
      res.json(items);
    } else {
      res.status(404).json({ error: 'Items not found' });
    }
  } catch (error) {
    console.error('Failed to fetch from Steam Market API:', error);
    res.status(500).json({ error: 'Failed to fetch items from Steam API' });
  }
});

// Функція для отримання ціни - тепер використовується сторонній API для цін
app.get('/price', async (req, res) => {
  const itemName = req.query.item_name;
  const game = req.query.game;
  
  if (!itemName || !game) {
    return res.status(400).json({ error: 'Item name and game are required' });
  }
  
  let appId;
  if (game === 'CS2') {
    appId = 730;
  } else if (game === 'Dota 2') {
    appId = 570;
  } else if (game === 'PUBG') {
    appId = 578080;
  } else {
    appId = null;
  }

  if (!appId) {
    return res.status(400).json({ error: 'Invalid game specified' });
  }

  try {
    // Використовуємо сторонній API для отримання ціни
    const apiUrl = `https://api.steamapi.io/market/price/${appId}/${encodeURIComponent(itemName)}?key=${STEAM_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.lowest_price) {
      const priceString = data.lowest_price;
      const price = parseFloat(priceString.replace(/[^\d.,]/g, '').replace(',', '.'));
      res.json({ price });
    } else {
      res.status(404).json({ error: 'Price not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server is running on http://localhost:${port}`);
});
