const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

// Log every incoming request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

// ====================================================================
// [ОБНОВЛЕНО] - Додаємо новий домен Vercel до списку дозволених
// ====================================================================
const allowedOrigins = [
  'http://localhost:3000',
  'https://steam-investment-app-frontend.vercel.app',
  // Ваш новий домен Vercel з логів
  'https://steam-investment-app-frontend-l7d916yuv-itsdelka001s-projects.vercel.app' 
];

app.use(cors({
  origin: function (origin, callback) {
    // Дозволяємо запити без "origin" (наприклад, з Postman) або з дозволених доменів
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS error: Origin ${origin} not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

const STEAM_API_KEY = process.env.STEAM_API_KEY;

if (!STEAM_API_KEY) {
  console.error('STEAM_API_KEY is not set. Please set it as an environment variable.');
  process.exit(1);
}

app.get('/search', async (req, res) => {
  const query = req.query.query;
  const game = req.query.game;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  let appId;
  if (game === 'CS2') {
    appId = 730;
  } else if (game === 'Dota 2') {
    appId = 570;
  } else {
    appId = 730;
  }

  try {
    const apiUrl = `https://steamcommunity.com/market/search/render?query=${encodeURIComponent(query)}&appid=${appId}&norender=1&count=10`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.results) {
      const items = data.results.map(item => ({
        label: item.market_hash_name,
        value: item.market_hash_name,
        image: item.asset_description.icon_url,
      }));
      res.json(items);
      console.log(`Successfully fetched ${items.length} items for query: ${query}`);
    } else {
      res.status(404).json({ error: 'Items not found' });
      console.log(`Items not found for query: ${query}`);
    }
  } catch (error) {
    console.error('Failed to fetch from Steam Market API:', error);
    res.status(500).json({ error: 'Failed to fetch items from Steam API' });
  }
});

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
    const apiUrl = `https://api.steamapi.io/market/price/${appId}/${encodeURIComponent(itemName)}?key=${STEAM_API_KEY}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data.success && data.lowest_price) {
      const priceString = data.lowest_price;
      const price = parseFloat(priceString.replace(/[^\d.,]/g, '').replace(',', '.'));
      res.json({ price });
      console.log(`Successfully fetched price for item: ${itemName}`);
    } else {
      res.status(404).json({ error: 'Price not found' });
      console.log(`Price not found for item: ${itemName}`);
    }
  } catch (error) {
    console.error('Failed to fetch price from Steam API:', error);
    res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server is running on http://localhost:${port}`);
});
