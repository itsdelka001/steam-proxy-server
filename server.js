const express = require('express');
const cors = require('cors'); // Імпортуємо бібліотеку CORS
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

// Оновлюємо цю змінну, якщо потрібно, щоб вказати домен вашого фронтенду
// Якщо ви тестуєте локально, залиште її як 'http://localhost:3000'
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173', // Додаємо, якщо використовуєте Vite
  'https://steam-investment-app-frontend.vercel.app' // Додайте домен, на якому розміщено ваш фронтенд
];

app.use(cors({
  origin: function (origin, callback) {
    // Дозволяємо запити без origin (наприклад, з мобільного додатка або curl)
    // та запити з дозволених доменів
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
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

// Функція для пошуку предметів
app.get('/search', async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  // Це лише приклад, вам потрібно буде адаптувати це до реального API Steam
  // або іншого сервісу, який надає автозаповнення.
  const mockItems = [
    { label: `${query} (CS2)`, value: `${query} (CS2)` },
    { label: `${query} (Dota 2)`, value: `${query} (Dota 2)` },
    { label: `★ Huntsman Knife | Doppler (${query})`, value: `★ Huntsman Knife | Doppler (${query})` },
  ];
  
  // Імітація затримки, щоб побачити індикатор завантаження
  setTimeout(() => {
    res.json(mockItems);
  }, 500);
});

// Функція для отримання ціни
app.get('/price', async (req, res) => {
  const itemName = req.query.item_name;
  const game = req.query.game;
  if (!itemName || !game) {
    return res.status(400).json({ error: 'Item name and game are required' });
  }
  
  // Тут ви маєте реалізовувати запит до Steam API або іншого сервісу
  // Використання 'fetch' для прикладу
  try {
    // Приклад: запит до API Steam (URL може відрізнятися)
    // const apiUrl = `http://api.steampowered.com/ISteamEconomy/GetAssetPrices/v1?key=${STEAM_API_KEY}&appid=730`;
    // const response = await fetch(apiUrl);
    // const data = await response.json();
    // const price = data.prices.find(item => item.name === itemName)?.price;

    // Зараз використовуємо фіктивну ціну
    const mockPrice = Math.random() * 100 + 10; // Випадкова ціна
    res.json({ price: mockPrice });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server is running on http://localhost:${port}`);
});
