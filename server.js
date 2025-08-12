const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3001;

// Логи запитів
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

// Дозволені домени для CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://steam-investment-app-frontend.vercel.app',
  'https://steam-investment-app-frontend-l7d916yuv-itsdelka001s-projects.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS error: Origin ${origin} not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Заголовки для запитів до Steam
const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};

// AppID для ігор
const APP_IDS = {
  'cs2': 730,
  'dota 2': 570,
  'pubg': 578080
};

// Пошук предметів
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

    if (data && data.success && Array.isArray(data.results)) {
      const items = data.results.map(item => {
        // Перевіряємо, чи є asset_description та icon_url
        const iconUrlPath = item.asset_description && item.asset_description.icon_url
          ? item.asset_description.icon_url
          : null;

        // Обробка float (якщо є)
        let floatValue = null;
        if (
          item.asset_description &&
          item.asset_description.actions &&
          Array.isArray(item.asset_description.actions) &&
          item.asset_description.actions.length > 0
        ) {
          const match = item.asset_description.actions[0].link.match(/(\d\.\d+)/);
          floatValue = match ? match[0] : null;
        }

        return {
          name: item.name,
          price: parseFloat(item.sell_price_text.replace(/[^0-9,.]/g, '').replace(',', '.')) || null,
          market_hash_name: item.market_hash_name,
          icon_url: iconUrlPath
            ? `https://community.cloudflare.steamstatic.com/economy/image/${iconUrlPath}`
            : null,  // Якщо немає картинки — повертати null
          float: floatValue
        };
      });

      return res.json(items);
    } else {
      return res.json([]);
    }
  } catch (error) {
    console.error('[Search] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch items from Steam API' });
  }
});

// Отримання ціни предмета
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
      const price = parseFloat(data.lowest_price.replace(/[^0-9,.]/g, '').replace(',', '.')) || null;
      return res.json({ price });
    } else {
      return res.status(404).json({ error: 'Price not found' });
    }
  } catch (error) {
    console.error('[Price] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});