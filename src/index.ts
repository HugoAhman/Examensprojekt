import * as mongoose from 'mongoose';
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { Stock, Portfolio, Transaction } from "./schema";
import dotenv from 'dotenv';
import { staticPlugin } from '@elysiajs/static'

dotenv.config();

if (!process.env.MONGO_URI || !process.env.TWELVE_DATA_API_KEY) {
    throw new Error("Environment variables missing. Control your .env file.");
}

// MongoDB-connection
try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log("Connected to MongoDB");
} catch (error) {
    console.error("Error when connecting to MongoDB:", error);
    process.exit(1);
}

// Elysia-app
const app = new Elysia();

app.use(cors());
app.use(staticPlugin({
    prefix: '/',
    assets: './src',
}))

// Global variables for portfolio and budget
const tradingState: Record<string, { budget: number; holdings: number; purchasePrice: number }> = {};
let activeSymbols: string[] = [];

// Fetch and save stockdata
const fetchAndStoreStockData = async (symbol: string) => {
    try {
        const response = await fetch(`https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&apikey=${process.env.TWELVE_DATA_API_KEY}`);
        const data = await response.json();

        if (data && data.values) {
            const stockData = data.values.map((entry: { datetime: any; open: string; close: string; high: string; low: string; }) => ({
                symbol,
                date: entry.datetime,
                open: parseFloat(entry.open),
                close: parseFloat(entry.close),
                high: parseFloat(entry.high),
                low: parseFloat(entry.low)
            }));

            // Save to MongoDB
            await Stock.insertMany(stockData);
            console.log(`Data for ${symbol} has been saved.`);
        }
    } catch (error) {
        console.error('Error when fetching stockdata:', error);
    }
};

// UpdatePortfolio-function
const updatePortfolio = async (symbol: any, type: string, price: number | null | undefined, quantity: number | null | undefined) => {
    let portfolio = await Portfolio.findOne({ symbol });
    const stockData = await Stock.find({ symbol }).sort({ date: 1 });

    // If no portfolio exists, create a new portfolio
    if (!portfolio) {
        portfolio = new Portfolio({
            symbol,
            quantity: 0,
            averagePrice: 0,
            budget: 2000,
        });
    }

    // Handle buying
    if (type === 'buy') {
        // Update averageprice and quantity
        portfolio.averagePrice = ((portfolio.averagePrice * portfolio.quantity) + (price * quantity)) / (portfolio.quantity + quantity);
        portfolio.budget -= price * quantity;
        portfolio.quantity += quantity;
    }
    // Handle sale
    if (type === 'sell') {
        // Update quantity at sale
        if (portfolio.quantity <= 0) {
            await Portfolio.deleteOne({ symbol });
        }
        portfolio.budget += price * quantity;
        if (portfolio.budget < 0) {
            portfolio.budget = portfolio.budget - + portfolio.budget;
        }
        portfolio.quantity -= quantity;
    }
    // Save the uppdated portfolio
    await portfolio.save();

    await Transaction.create({ symbol, type, price, quantity, date: new Date() });


    // Save transactions
};

// Functions to decide buy and sell
const shouldBuy = (currentPrice: number | null | undefined, previousPrice: number | null | undefined, thresholdDrop: number) => {
    return ((previousPrice - currentPrice) / previousPrice) * 100 >= thresholdDrop;
};

const shouldSell = (currentPrice: number | null | undefined, purchasePrice: number | null | undefined, thresholdRise: number) => {
    return ((currentPrice - purchasePrice) / purchasePrice) * 100 >= thresholdRise;
};

// Simulated tradingfunction based of historical data
const startTrading = async (symbol: string, thresholdDrop: number, thresholdRise: number) => {
    console.log(`Starting tradingsimulation for ${symbol}`);

    const stockData = await Stock.find({ symbol }).sort({ date: 1 });
    if (!stockData.length) {
        console.error(`No historical data found for ${symbol}`);
        return;
    }
    console.log(stockData);

    const portfolio = await Portfolio.findOne({ symbol });

    let budget = portfolio ? portfolio.budget : 2000; // If fortfolio exists, use budget otherwise start with 2000
    let holdings = portfolio ? portfolio.quantity : 0; // If portfolio exists , use holdings
    let purchasePrice = portfolio ? portfolio.averagePrice : 0; // If portfolio exists, use purchaseprice


    for (let i = 1; i < stockData.length; i++) {
        const previous = stockData[i - 1];
        const current = stockData[i];

        console.log(`Should buy: ${shouldBuy(current.close, previous.close, thresholdDrop)}`);
        console.log(`Should sell: ${shouldSell(current.close, purchasePrice, thresholdRise)}`);


        if (holdings === 0 && shouldBuy(current.close, previous.close, thresholdDrop)) {
            const quantity = Math.floor(budget / current.close);
            if (quantity > 0) {
                holdings += quantity;
                budget -= quantity * current.close;
                purchasePrice = current.close;

                console.log(`Bought ${quantity} stocks of ${symbol} for ${current.close} USD per stock the ${current.date}.`);
                console.log(`After purchase: Budget: ${budget}, Holdings: ${holdings}`);
                await updatePortfolio(symbol, 'buy', current.close, holdings);
            }

            else {
                console.log('Purchase failed: Not enough budget.');
            }
        }
        else if (holdings > 0 && shouldSell(current.close, purchasePrice, thresholdRise)) {
            budget += holdings * current.close;
            console.log(`Sold ${holdings} stocks of ${symbol} for ${current.close} USD per stock the ${current.date}.`);

            await updatePortfolio(symbol, 'sell', current.close, holdings);
            holdings = 0;
            console.log(`After sale: Budget: ${budget}, Holdings: ${holdings}`);
        }
    }

    console.log(`Simulation ended for ${symbol}. Budget: ${budget}, Holdings: ${holdings}`);

};

// Calculate portfolio value
const calculatePortfolioValue = async (symbol: { quantity: number; averagePrice: number; }) => {
    try {
        let calc = await Portfolio.find({ symbol });
        let value = symbol.quantity * symbol.averagePrice;
        console.log("Result from portfolio");
        console.log(`${value}`);
    } catch (error) {
        return { message: "Error trying to get portfolio, check if its empty" };
    }
};

// Endpoints
app.post('/fetch/:symbol', async ({ params }) => {
    try {
        await fetchAndStoreStockData(params.symbol);
        return { message: `Data for ${params.symbol} has been fetched.` };
    } catch (error) {
        return { error: `Could not fetch data for ${params.symbol}.` };
    }
});

app.get('/simulate/:symbol', async ({ params }) => {
    const symbol = params.symbol.toUpperCase();

    if (!symbol || symbol.trim() === "") {
        return { error: "Error: Invalid symbol." };
    }

    try {
        await startTrading(symbol, 2, 4); // Start simulation with thresholds
        const portfolio = await Portfolio.findOne({ symbol });
        const transactions = await Transaction.find({ symbol }).sort({ date: -1 });

        return {
            message: `Simulation for ${symbol} has ended.`,
            portfolio: portfolio || 'No portfolio found',
            transactions: transactions.map((t) => ({
                type: t.type,
                price: t.price,
                quantity: t.quantity,
            })),
        };

    } catch (error) {
        console.error(`Error when simulating for ${symbol}:`, error);
        return { error: `An error occured during simulation for ${symbol}.` };
    }

});

app.get('/simulation-status/:symbol', async ({ params }) => {
    const symbol = params.symbol.toUpperCase();
    const portfolio = await Portfolio.findOne({ symbol });

    if (!portfolio) {
        return { message: "No active simulation ongoing" };
    }

    return {
        symbol,
        portfolio: portfolio || 'No active portfolio',
    };
});

app.get('/simulation-report/:symbol', async ({ params }) => {
    const symbol = params.symbol.toUpperCase();
    const portfolio = await Portfolio.findOne({ symbol });
    const transactions = await Transaction.find({ symbol }).sort({ date: -1 });

    return {
        symbol,
        portfolio: portfolio || 'No active portfolio',
        transactions: transactions.map((t) => ({
            type: t.type,
            price: t.price,
            quantity: t.quantity,
            date: t.date,
        })),
    };
});

// View the value of the whole portfolio
app.get('/portfolio', async () => {
    const portfolio = await Portfolio.find();

    if (!portfolio || portfolio.length === 0) {
        return { message: 'No portfolio found', portfolio: [] };
    }

    let totalStockValue = 0;
    let totalBudget = 0;

    for (const sym of portfolio) {
        totalStockValue += sym.quantity * sym.averagePrice;
        totalBudget += sym.budget || 0;
    }

    try {
        return {
            message: 'Viewing portfolio!',
            portfolio: portfolio || 'No portfolio found',
            value_of_stocks: totalStockValue,
            value_with_budget: totalBudget + totalStockValue,
        };
    } catch (error) {
        console.error('Error occured when trying to view portfolio', error);
        return { error: 'An error occured when trying to view portfolio' };
    }
});

app.get('/portfolio/:symbol', async ({ params }) => {
    const symbol = params.symbol.toUpperCase();

    try {
        const portfolio = await Portfolio.findOne({ symbol });

        return {
            symbol,
            message: `Viewing portfolio for ${symbol}`,
            portfolio: portfolio?.symbol || `No portfolio found for ${symbol}`,
            quantity: portfolio?.quantity,
            value: portfolio?.averagePrice,
            value_of_stock: (portfolio?.quantity * portfolio?.averagePrice),
            value_with_budget: (portfolio?.budget + (portfolio?.quantity * portfolio?.averagePrice))
        }
    } catch (error) {

    }
});

// Show chart
app.get('/chart-data/:symbol', async ({ params }) => {
    const symbol = params.symbol.toUpperCase();

    try {
        const data = await Stock.find({ symbol }).sort({ date: 1 });

        return data.map((entry) => ({
            date: entry.date,
            closePrice: entry.close
        }));
    } catch (error) {
        return { error: `Could not fetch data for ${symbol}` };
    }
});

// Endpoint to delete all portfolio and transaction data in database
app.delete('/portfolio', async () => {
    try {
        const deletePortfolioData = await Portfolio.deleteMany();
        const deleteTransactionData = await Transaction.deleteMany();
        const portfolio = await Portfolio.findOne();
        let budget = portfolio?.budget;

        if (deletePortfolioData.deletedCount > 0) {
            budget = 0;
            return { message: 'All portfolio data deleted!' };
        }
        if (deleteTransactionData.deletedCount > 0) {
            return { message: 'All transaction data deleted!' };
        }
        else {
            return { message: 'No data found to delete!' };
        }
    } catch (error) {
        return { message: 'Error occured during data deletion.' };
    }
});

// Endpoint to delete all stock data in database
app.delete('/stocks', async () => {
    try {
        const deleteStocksData = await Stock.deleteMany();

        if (deleteStocksData.deletedCount > 0) {
            return { message: 'All stocks data deleted!' };
        }
        else {
            return { message: 'No stock data found to delete!' };
        }
    } catch (error) {
        return { message: 'Error occured during stock data deletion.' };
    }
})

// Start server
console.log('Server Date:', new Date().toString()); // Server date/time
console.log('Server Time Zone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
app.listen(3030, () => { console.log("Server is running at http://localhost:3030") });