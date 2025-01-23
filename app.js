// Импорт необходимых модулей
const express = require('express');
const ccxt = require('ccxt');

// Список бирж
const exchangeNames = ['htx', 'xt', 'kraken', 'bitfinex', 'mexc', 'bingx', 'lbank', 'bitget'];

// Инициализация бирж через CCXT
function initializeExchanges() {
    const exchanges = {};
    exchangeNames.forEach(name => {
        try {
            exchanges[name] = new ccxt[name]({ enableRateLimit: true });
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
            console.log(`Получение данных с ${name}...`);
            const tickers = await exchange.fetchTickers();
            allPrices[name] = Object.fromEntries(
                Object.entries(tickers)
                    .map(([pair, ticker]) => [pair, ticker.last])
                    .filter(([, price]) => price !== null)
            );
        } catch (error) {
            console.error(`Ошибка получения данных с ${name}:`, error);
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
            .filter(([, price]) => price !== undefined);

        for (const [buyExchange, buyPrice] of validPrices) {
            for (const [sellExchange, sellPrice] of validPrices) {
                if (buyExchange !== sellExchange && buyPrice < sellPrice) {
                    const profit = ((sellPrice - buyPrice) / buyPrice) * 100;
                    if (profit >= 2 && profit <= 50) {
                        opportunities.push({
                            pair,
                            buyExchange,
                            sellExchange,
                            buyPrice,
                            sellPrice,
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
    const opportunities = calculateArbitrage(allPrices);
    console.log(opportunities); // Проверка переданных данных
    res.render('index', { opportunities });
});

// Экспорт приложения для Vercel
module.exports = app;

// Запуск сервера (локально)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Сервер запущен на http://localhost:${PORT}`));
}
