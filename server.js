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
  'dota 2': 570,
  'pubg': 578080
};

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

  console.log(`[Search] - Sending request to official Steam API for query: '${query}' in game: '${game}' (appId: ${appId})`);

  try {
    const apiUrl = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(query)}&start=0&count=50&appid=${appId}&norender=1`;
    console.log(`[Search] - Full API URL: ${apiUrl}`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });

    // Додана перевірка для уникнення помилок, якщо відповідь не є JSON
    const data = await response.json().catch(err => {
      console.error('[Search] - Failed to parse JSON response:', err);
      return null;
    });

    if (data && data.success && data.results) {
      const items = data.results.map(item => ({
        name: item.name,
        price: parseFloat(item.sell_price_text.replace(/[^0-9,.]/g, '').replace(',', '.')),
        market_hash_name: item.market_hash_name,
        icon_url: item.asset_description.icon_url
          ? `https://community.cloudflare.steamstatic.com/economy/image/${item.asset_description.icon_url}`
          : '',
        float: item.asset_description.actions && item.asset_description.actions[0]
          ? item.asset_description.actions[0].link.match(/(\d\.\d+)/)
            ? item.asset_description.actions[0].link.match(/(\d\.\d+)/)[0]
            : null
          : null
      }));
      res.json(items);
      console.log(`[Search] - Successfully processed and returned ${items.length} items.`);
    } else {
      res.json([]);
      console.log(`[Search] - No results found or data is invalid, returning empty array.`);
    }
  } catch (error) {
    console.error('[Search] - Error fetching items from Steam API:', error);
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
    console.log(`[Price] - Sending request to official Steam API for item '${itemName}'`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    console.log(`[Price] - Received response from Steam API:`, JSON.stringify(data, null, 2));

    if (data.success && data.lowest_price) {
      const priceString = data.lowest_price;
      const price = parseFloat(priceString.replace(/[^0-9,.]/g, '').replace(',', '.'));
      res.json({ price });
      console.log(`[Price] - Successfully fetched price for item: ${itemName}`);
    } else {
      res.status(404).json({ error: 'Price not found' });
      console.log(`[Price] - Price not found for item: ${itemName}`);
    }
  } catch (error) {
    console.error('[Price] - Error fetching price from Steam API:', error);
    res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});