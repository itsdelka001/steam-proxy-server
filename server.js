const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

// Логуємо кожен вхідний запит, що надходить на сервер
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);
  next();
});

// Дозволені джерела (домени), з яких можуть надходити запити.
// Це важливо для безпеки та запобігання помилкам CORS.
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

// Додаємо User-Agent для імітації браузерного запиту, щоб Steam не блокував його.
const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
};

// Ендпоінт для пошуку предметів
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

  console.log(`[Search] - Sending request to official Steam API for query: '${query}' in game: '${game}' (appId: ${appId})`);

  try {
    const apiUrl = `https://steamcommunity.com/market/search/render/?query=${encodeURIComponent(query)}&start=0&count=50&appid=${appId}&norender=1`;
    console.log(`[Search] - Full API URL: ${apiUrl}`);

    const response = await fetch(apiUrl, { headers: defaultHeaders });
    const data = await response.json();

    console.log(`[Search] - Received response from Steam API:`, JSON.stringify(data, null, 2));

    if (data.success && data.results) {
      // Мапуємо результати до більш чистого формату
      const items = data.results.map(item => ({ 
        name: item.name, 
        price: parseFloat(item.sell_price_text.replace(/[^0-9,.]/g, '').replace(',', '.')),
        market_hash_name: item.market_hash_name,
        icon_url: `https://community.cloudflare.steamstatic.com/economy/image/${item.icon_url}`
      }));
      res.json(items);
      console.log(`[Search] - Successfully processed and returned ${items.length} items.`);
    } else {
      res.json([]);
      console.log(`[Search] - No results found, returning empty array.`);
    }
  } catch (error) {
    console.error('[Search] - Error fetching items from Steam API:', error);
    res.status(500).json({ error: 'Failed to fetch items from Steam API' });
  }
});

// Ендпоінт для отримання ціни конкретного предмета
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
    const apiUrl = `https://steamcommunity.com/market/priceoverview/?appid=${appId}&currency=1&market_hash_name=${encodeURIComponent(itemName)}`;
    
    // Додаємо логування для відстеження відповіді від Steam API
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
