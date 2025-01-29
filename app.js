// Импорт необходимых модулей
const express = require('express');
const ccxt = require('ccxt');

// Список бирж
const exchangeNames = ['huobi', 'xt', 'kraken', 'bitfinex', 'mexc', 'bingx', 'lbank', 'bitget'];

// Инициализация бирж через CCXT
function initializeExchanges() {
    const exchanges = {};
    exchangeNames.forEach(name => {
        try {
            exchanges[name] = new ccxt[name]({ enableRateLimit: true });
            console.log(`Успешно подключено к бирже: ${name}`);
        } catch (error) {
            console.error(`Ошибка подключения к бирже ${name}:`, error);
        }
    });
    return exchanges;
}

// Получение всех пар и их цен
async function fetchAllPrices(exchanges) {
    const allPrices = {};
    for (const [name, exchange] of Object.entries(exchanges)) {
        try {
            console.log(`Получение данных с биржи ${name}...`);
            const tickers = await exchange.fetchTickers();

            // Фильтрация данных для сохранения только доступных цен
            allPrices[name] = Object.fromEntries(
                Object.entries(tickers)
                    .map(([pair, ticker]) => {
                        const price = ticker.last || ticker.close; // Последняя или закрытая цена
                        return [pair, price];
                    })
                    .filter(([, price]) => price !== null && price > 0) // Удаляем пустые и нулевые цены
                    .map(([pair, price]) => [pair, parseFloat(price.toPrecision(15))]) // Точная обработка сверхмалых цен
            );
        } catch (error) {
            console.error(`Ошибка получения данных с биржи ${name}:`, error);
        }
    }
    return allPrices;
}

// Расчет арбитражных возможностей
function calculateArbitrage(allPrices) {
    const opportunities = [];
    const pairs = new Set(Object.values(allPrices).flatMap(prices => Object.keys(prices)));

    for (const pair of pairs) {
        const pricesByExchange = Object.entries(allPrices)
            .reduce((acc, [exchange, prices]) => {
                if (prices[pair] !== undefined) {
                    acc[exchange] = prices[pair];
                }
                return acc;
            }, {});

        const validPrices = Object.entries(pricesByExchange)
            .filter(([, price]) => price !== undefined && price > 0); // Удаляем пустые и нулевые значения

        for (const [buyExchange, buyPrice] of validPrices) {
            for (const [sellExchange, sellPrice] of validPrices) {
                if (buyExchange !== sellExchange && buyPrice < sellPrice) {
                    const profit = ((sellPrice - buyPrice) / buyPrice) * 100;
                    if (profit >= 2 && profit <= 50) {
                        opportunities.push({
                            pair,
                            buyExchange,
                            sellExchange,
                            buyPrice: parseFloat(buyPrice.toFixed(15)), // Точная цена с высокой точностью
                            sellPrice: parseFloat(sellPrice.toFixed(15)), // Точная цена с высокой точностью
                            profit: parseFloat(profit.toFixed(2))
                        });
                    }
                }
            }
        }
    }

    return opportunities.sort((a, b) => b.profit - a.profit);
}

// Инициализация Express
const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Главная страница
app.get('/', async (req, res) => {
    const exchanges = initializeExchanges();
    const allPrices = await fetchAllPrices(exchanges);

    // Если данные не удалось загрузить
    if (Object.keys(allPrices).length === 0) {
        return res.render('index', { opportunities: [], error: 'Ошибка загрузки данных с бирж.' });
    }

    const opportunities = calculateArbitrage(allPrices);
    console.log(opportunities); // Проверка переданных данных
    res.render('index', { opportunities, error: null });
});

// Экспорт приложения для Vercel
module.exports = app;

// Запуск сервера (локально)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
}
