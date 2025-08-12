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

const STEAM_API_KEY = process.env.STEAM_API_KEY;

if (!STEAM_API_KEY) {
  console.error('STEAM_API_KEY is not set. Please set it as an environment variable.');
  process.exit(1);
}

app.get('/search', async (req, res) => {
  const query = req.query.query;
  const game = req.query.game;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
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

  // Add logging for the request being made to the Steam API
  console.log(`[Search] - Sending request to Steam API for query: '${query}' in game: '${game}' (appId: ${appId})`);

  try {
    const apiUrl = `https://api.steamapi.io/market/search/v1?api_key=${STEAM_API_KEY}&app_id=${appId}&search_term=${encodeURIComponent(query)}`;
    
    // Add logging to show the full URL
    console.log(`[Search] - Full API URL: ${apiUrl}`);

    const response = await fetch(apiUrl);
    const data = await response.json();
    
    // Add logging to show the full response from the Steam API
    console.log(`[Search] - Received response from Steam API:`, JSON.stringify(data, null, 2));

    if (data.success && data.results) {
      const items = data.results.map(item => ({ name: item.name, price: item.price }));
      res.json(items);
      console.log(`[Search] - Successfully processed and returned ${items.length} items.`);
    } else {
      res.json([]); // Return an empty array if no results are found
      console.log(`[Search] - No results found, returning empty array.`);
    }
  } catch (error) {
    console.error('Error fetching items from Steam API:', error);
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

    // Додаємо логування для відстеження відповіді від Steam API
    console.log(`[Price] - SteamAPI.io response for item '${itemName}':`, JSON.stringify(data, null, 2));

    if (data.success && data.lowest_price) {
      const priceString = data.lowest_price;
      const price = parseFloat(priceString.replace(/[^\\d.,]/g, '').replace(',', '.'));
      res.json({ price });
      console.log(`[Price] - Successfully fetched price for item: ${itemName}`);
    } else {
      res.status(404).json({ error: 'Price not found' });
      console.log(`[Price] - Price not found for item: ${itemName}`);
    }
  } catch (error) {
    console.error('Error fetching price from Steam API:', error);
    res.status(500).json({ error: 'Failed to fetch price from Steam API' });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});
