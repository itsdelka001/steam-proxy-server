    // server.js
    const express = require('express');
    const axios = require('axios');
    const cors = require('cors');

    const app = express();
    const PORT = 3001; // Порт, на якому буде працювати сервер

    // ВАШ STEAM API КЛЮЧ
    // !!! Замініть 'YOUR_STEAM_API_KEY' на ваш реальний ключ !!!
    // Важливо: цей ключ зберігається лише тут і не буде доступний з фронт-енду.
    const STEAM_API_KEY = '476227250E77619FF4742E155F645AFC';

    // ID ігор для Steam Community Market
    const APP_IDS = {
      'CS2': '730',
      'Dota 2': '570',
      'PUBG': '578080',
    };

    // Дозволяємо запити з фронт-енду (React-застосунку)
    app.use(cors());
    app.use(express.json());

    // Ендпоінт для отримання предметів з Steam Community Market
    app.get('/api/steam-items', async (req, res) => {
      const { game, query } = req.query;

      if (!game || !APP_IDS[game]) {
        return res.status(400).json({ error: 'Недійсна назва гри.' });
      }

      const appId = APP_IDS[game];
      // Формуємо URL-запит до Steam API. Ключ тут не потрібен, оскільки ми використовуємо
      // публічний ендпоінт ринку, але в інших випадках ми б його додавали.
      const steamUrl = `https://steamcommunity.com/market/search/render/?search_descriptions=0&sort_column=popular&sort_dir=desc&appid=${appId}&norender=1&count=20&query=${query || ''}`;

      console.log(`Запит до Steam API: ${steamUrl}`);

      try {
        const response = await axios.get(steamUrl);
        // Обробка отриманих даних
        const items = response.data.results.map(item => ({
          name: item.name,
          currentPriceUAH: parseFloat(item.sell_price_text.replace(/[^\d,.]/g, '').replace(',', '.')) || 0, // Парсимо ціну
          photoUrl: item.asset_description.icon_url ? `https://steamcommunity-a.akamaihd.net/economy/image/${item.asset_description.icon_url}` : null,
        }));
        res.json(items);
      } catch (error) {
        console.error('Помилка при запиті до Steam API:', error.message);
        res.status(500).json({ error: 'Не вдалося отримати дані від Steam.' });
      }
    });

    app.listen(PORT, () => {
      console.log(`Сервер працює на порту ${PORT}`);
      console.log('Готовий приймати запити від React-застосунку...');
    });
    