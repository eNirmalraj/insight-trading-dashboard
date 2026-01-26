
import ccxt from 'ccxt';

const run = async () => {
    console.log("Testing CCXT Fetch OHLCV...");
    const exchange = new ccxt.binance({ enableRateLimit: true });

    try {
        console.log("Loading markets...");
        await exchange.loadMarkets();
        console.log("Markets loaded.");

        const symbol = 'BTC/USDT';
        console.log(`Fetching 1m candles for ${symbol}...`);
        const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 10);

        console.log(`Result: ${ohlcv.length} candles`);
        if (ohlcv.length > 0) {
            console.log("Sample candle:", ohlcv[0]);
        }

    } catch (error) {
        console.error("CCXT Error:", error);
    }
};

run();
