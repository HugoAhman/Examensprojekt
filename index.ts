import mongoose, { connect, set } from "mongoose";
import { Elysia } from "elysia";
import { Chart } from 'chart.js/auto';
import { Stock } from "./schema";
import { Portfolio } from "./schema";
import { Transaction } from "./schema";

await mongoose.connect();

const app = new Elysia();

const fetchAndStoreStockData = async (symbol: string) => {
    try {
        const response = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&apikey=`);
        const data = await response.json();

        if (data && data.values) {
            const stockData = data.values.map((entry: { datetime: any; open: string; close: string; high: string; low: string; }) => ({
                symbol,
                date: entry.datetime,
                open: parseFloat(entry.open),
                close: parseFloat(entry.close),
                high: parseFloat(entry.high),
                low: parseFloat(entry.low),
            }));

            // Spara till MongoDB
            await Stock.insertMany(stockData);
            console.log(`Data för ${symbol} har sparats.`);
        }
    } catch (error) {
        console.error('Fel vid hämtning av aktiedata:', error);
    }
};

const shouldBuy = (currentPrice: number, previousPrice: number, thresholdDrop: number) =>
    (previousPrice - currentPrice) / previousPrice * 100 >= thresholdDrop;

const shouldSell = (currentPrice: number, purchasePrice: number, thresholdRise: number) =>
    (currentPrice - purchasePrice) / purchasePrice * 100 >= thresholdRise;

const simulateTrading = async (symbol: string, thresholdDrop: number, thresholdRise: number) => {
    const stockData = await Stock.find({ symbol }).sort({ date: 1 });

    let budget = 1000; // Simulerad budget i USD
    let holdings = 0; // Antal aktier ägda
    let purchasePrice = 0;

    for (let i = 1; i < stockData.length; i++) {
        const currentPrice = stockData[i].close;
        const previousPrice = stockData[i - 1].close;

        if (shouldBuy(currentPrice, previousPrice, thresholdDrop) && budget >= currentPrice) {
            // Köp aktier
            holdings++;
            purchasePrice = currentPrice;
            budget -= currentPrice;
            console.log(`Köpt 1 aktie av ${symbol} för ${currentPrice} USD.`);
        } else if (holdings > 0 && shouldSell(currentPrice, purchasePrice, thresholdRise)) {
            // Sälj aktier
            holdings--;
            budget += currentPrice;
            console.log(`Sålt 1 aktie av ${symbol} för ${currentPrice} USD.`);
        }
    }

    console.log(`Simulering klar. Budget: ${budget}, Holdings: ${holdings}`);
};


// Exempel: Hämta data för AAPL
// await fetchAndStoreStockData('AAPL');

// Exempel: Simulera för AAPL
// await simulateTrading('AAPL', 5, 10);


wss://ws.twelvedata.com/v1/quotes/price?apikey=f890bf4d27b64b26ad4e9c825dd0a5bf

app.post('/fetch/:symbol', async ({ params }) => {
    await fetchAndStoreStockData(params.symbol);
    return `Data för ${params.symbol} har hämtats.`;
});

app.get('/simulate/:symbol', async ({ params }) => {
    await simulateTrading(params.symbol, 5, 10);
    return `Simulering för ${params.symbol} klar.`;
});

app.get('/portfolio', async () => {
    const portfolio = await Portfolio.find();
    return portfolio;
});

app.listen(3030);





