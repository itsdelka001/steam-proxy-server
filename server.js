const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3001;

// Логування вхідних запитів
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

// Дозволені origin для CORS
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

// Заголовок User-Agent для API Steam
const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};

// ID ігор для API Steam
const APP_IDS = {
  'cs2': 730,
  'dota 2': 570,
  'pubg': 578080
};

// Ендпоінт пошуку предметів
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
    console.log(`[Search] Request to Steam API: ${apiUrl}`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json().catch(err => {
      console.error('[Search] Failed to parse JSON:', err);
      return null;
    });

    if (data && data.success && data.results) {
      const items = data.results.map(item => {
        const iconUrl = item.asset_description?.icon_url
          ? `https://community.cloudflare.steamstatic.com/economy/image/${item.asset_description.icon_url}`
          : null;

        let floatValue = null;
        if (item.asset_description?.actions?.[0]?.link) {
          const match = item.asset_description.actions[0].link.match(/(\d\.\d+)/);
          floatValue = match ? match[0] : null;
        }

        const priceString = item.sell_price_text || '';
        const price = parseFloat(priceString.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;

        return {
          name: item.name,
          price,
          market_hash_name: item.market_hash_name,
          icon_url: iconUrl,
          float: floatValue
        };
      });

      console.log(`[Search] Found ${items.length} items`);
      return res.json(items);
    } else {
      console.log('[Search] No results or invalid data, returning empty array');
      return res.json([]);
    }
  } catch (error) {
    console.error('[Search] Error fetching from Steam API:', error);
    return res.status(500).json({ error: 'Failed to fetch items from Steam API' });
  }
});

// Ендпоінт отримання ціни предмета
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
    console.log(`[Price] Request price for item: ${itemName}`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    if (data.success && data.lowest_price) {
      const price = parseFloat(data.lowest_price.replace(/[^0-9,.]/g, '').replace(',', '.')) || 0;
      console.log(`[Price] Price found: ${price}`);
      return res.json({ price });
    } else {
      console.log(`[Price] Price not found for item: ${itemName}`);
      return res.status(404).json({ error: 'Price not found' });
    }
  } catch (error) {
    console.error('[Price] Error fetching price:', error);
    return res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});