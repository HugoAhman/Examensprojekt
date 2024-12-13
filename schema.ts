import mongoose from 'mongoose';

const StockSchema = new mongoose.Schema({
    symbol: String,
    date: String,
    open: Number,
    close: Number,
    high: Number,
    low: Number,
});

const PortfolioSchema = new mongoose.Schema({
    symbol: String,
    quantity: Number,
    averagePrice: Number,
});

const TransactionSchema = new mongoose.Schema({
    symbol: String,
    type: String, // "buy" or "sell"
    price: Number,
    quantity: Number,
    date: Date,
});

export const Stock = mongoose.model('Stock', StockSchema);
export const Portfolio = mongoose.model('Portfolio', PortfolioSchema);
export const Transaction = mongoose.model('Transaction', TransactionSchema);