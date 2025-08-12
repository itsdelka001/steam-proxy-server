const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

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

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};

const APP_IDS = {
  'cs2': 730,
  'cs:go': 730,
  'csgo': 730,
  'dota 2': 570,
  'pubg': 578080
};

// Функція для вибору CDN картинки, перевірка префіксів
function buildImageUrl(iconUrl) {
  if (!iconUrl) return null;

  // Спробуємо один з двох популярних CDN
  const cdnHosts = [
    'https://steamcommunity-a.akamaihd.net/economy/image/',
    'https://community.cloudflare.steamstatic.com/economy/image/'
  ];

  // Тут можна розширити логіку для вибору CDN, але поки просто повернемо перший робочий
  // Якщо треба, можна робити перевірку доступності асинхронно, але це ускладнить сервер
  return cdnHosts[0] + iconUrl;
}

app.get('/search', async (req, res) => {
  const query = req.query.query;
  const game = req.query.game ? req.query.game.toLowerCase().trim() : null;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const appId = APP_IDS[game];

  if (!appId) {
    return res.status(400).json({ error: 'Invalid game specified' });
  }

  try {
    const apiUrl = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(query)}&start=0&count=50&appid=${appId}&norender=1`;

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    if (data && data.success && data.results) {
      const items = data.results.map(item => {
        // Витягуємо float, якщо він є
        let floatValue = null;
        try {
          if (item.asset_description.actions && item.asset_description.actions[0]) {
            const match = item.asset_description.actions[0].link.match(/(\d\.\d+)/);
            floatValue = match ? match[0] : null;
          }
        } catch {
          floatValue = null;
        }

        // Ціна в числовому форматі
        let priceNum = null;
        if (item.sell_price_text) {
          priceNum = parseFloat(
            item.sell_price_text.replace(/[^0-9,.]/g, '').replace(',', '.')
          );
        }

        return {
          name: item.name,
          price: priceNum,
          market_hash_name: item.market_hash_name,
          icon_url: buildImageUrl(item.asset_description.icon_url),
          float: floatValue
        };
      });
      res.json(items);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('[Search] - Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items from Steam API' });
  }
});

app.get('/price', async (req, res) => {
  const itemName = req.query.item_name;
  const game = req.query.game ? req.query.game.toLowerCase().trim() : null;

  if (!itemName || !game) {
    return res.status(400).json({ error: 'Item name and game are required' });
  }

  const appId = APP_IDS[game];

  if (!appId) {
    return res.status(400).json({ error: 'Invalid game specified' });
  }

  try {
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?appid=${appId}&currency=1&market_hash_name=${encodeURIComponent(itemName)}`;

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    if (data.success && data.lowest_price) {
      const price = parseFloat(data.lowest_price.replace(/[^0-9,.]/g, '').replace(',', '.'));
      res.json({ price });
    } else {
      res.status(404).json({ error: 'Price not found' });
    }
  } catch (error) {
    console.error('[Price] - Error fetching price:', error);
    res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at port ${port}`);
});
