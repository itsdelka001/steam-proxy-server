const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3001;

// Логуємо кожен вхідний запит
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

// Використовуємо офіційні ендпоінти Steam, тому ключ API більше не потрібен.
// const STEAM_API_KEY = process.env.STEAM_API_KEY;

// Додаємо User-Agent для імітації браузерного запиту, щоб Steam не блокував його.
const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

app.get('/price', async (req, res) => {
  const { game, itemName } = req.query;

  if (!game || !itemName) {
    return res.status(400).json({ error: 'Missing game or itemName parameter' });
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
    
    if (!response.ok) {
        console.error(`[Price] - Steam API responded with status: ${response.status} ${response.statusText}`);
        return res.status(response.status).json({ error: 'Failed to fetch price from Steam API' });
    }
    
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
    console.error(`[Price] - Internal Server Error for item '${itemName}':`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
