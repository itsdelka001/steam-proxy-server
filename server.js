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
  'dota 2': 570,
  'dota2': 570,
  'pubg': 578080,
  'playerunknown\'s battlegrounds': 578080
};

app.get('/search', async (req, res) => {
  const query = req.query.query;
  const game = req.query.game ? req.query.game.toLowerCase().trim() : null;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const appId = APP_IDS[game];

  if (!appId) {
    return res.status(400).json({ 
      error: 'Invalid game specified',
      validGames: Object.keys(APP_IDS).join(', ')
    });
  }

  console.log(`[Search] - Sending request for: '${query}' in game: '${game}' (appId: ${appId})`);

  try {
    const apiUrl = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(query)}&start=0&count=50&appid=${appId}&norender=1`;
    console.log(`[Search] - API URL: ${apiUrl}`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    if (data.success && data.results) {
      const items = data.results.map(item => {
        const iconUrl = item.asset_description?.icon_url 
          ? `https://community.cloudflare.steamstatic.com/economy/image/${item.asset_description.icon_url}`
          : '';

        return {
          name: item.name,
          price: parseFloat(item.sell_price_text.replace(/[^0-9,.]/g, '').replace(',', '.')),
          market_hash_name: item.market_hash_name,
          icon_url: iconUrl,
          float: extractFloatValue(item),
          stickers: extractStickers(item)
        };
      });

      console.log(`[Search] - Returned ${items.length} items`);
      res.json(items);
    } else {
      console.log(`[Search] - No results found`);
      res.json([]);
    }
  } catch (error) {
    console.error('[Search] - Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch items',
      details: error.message 
    });
  }
});

function extractFloatValue(item) {
  try {
    if (item.asset_description?.actions?.[0]?.link) {
      const floatMatch = item.asset_description.actions[0].link.match(/(\d\.\d+)/);
      return floatMatch ? parseFloat(floatMatch[0]) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function extractStickers(item) {
  try {
    if (item.asset_description?.descriptions) {
      return item.asset_description.descriptions
        .filter(desc => desc.value && desc.value.includes('Sticker'))
        .map(desc => desc.value.replace('Sticker: ', '').trim());
    }
    return [];
  } catch {
    return [];
  }
}

app.get('/price', async (req, res) => {
  const itemName = req.query.item_name;
  const game = req.query.game ? req.query.game.toLowerCase().trim() : null;

  if (!itemName || !game) {
    return res.status(400).json({ error: 'Item name and game are required' });
  }

  const appId = APP_IDS[game];

  if (!appId) {
    return res.status(400).json({ 
      error: 'Invalid game specified',
      validGames: Object.keys(APP_IDS).join(', ')
    });
  }

  try {
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?appid=${appId}&currency=1&market_hash_name=${encodeURIComponent(itemName)}`;
    console.log(`[Price] - Requesting price for: '${itemName}'`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    if (data.success && data.lowest_price) {
      const price = parseFloat(data.lowest_price.replace(/[^0-9,.]/g, '').replace(',', '.'));
      console.log(`[Price] - Price found: ${price}`);
      res.json({ price });
    } else {
      console.log(`[Price] - Price not found`);
      res.status(404).json({ error: 'Price not found' });
    }
  } catch (error) {
    console.error('[Price] - Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch price',
      details: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});