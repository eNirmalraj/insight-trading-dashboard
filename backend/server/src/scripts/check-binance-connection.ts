
import { binanceStream } from '../services/binanceStream';
import { eventBus, EngineEvents } from '../utils/eventBus';

console.log('Starting Binance Connection LIMIT Check...');

// Listen for price ticks
eventBus.on(EngineEvents.PRICE_TICK, ({ symbol, price }) => {
    // console.log(`[PRICE TICK] ${symbol}: ${price}`); // Silence ticks to avoid spam
});

eventBus.on(EngineEvents.CANDLE_CLOSED, ({ symbol, timeframe, candle }) => {
    console.log(`[CANDLE CLOSED] ${symbol} ${timeframe}`);
});

async function run() {
    try {
        console.log('Generating 200 dummy subscriptions to test URL length...');

        // Use top 100 pairs roughly by constructing them
        // We will just use BTC/USDT.P with different timeframes or just repeat valid streams?
        // Repeating valid streams might be deduplicated by Binance?
        // Let's use a list of valid symbols if possible.
        // Or just use 'btcusdt', 'ethusdt', 'bnbusdt', ... and all timeframes.

        const symbols = [
            'BTC/USDT.P', 'ETH/USDT.P', 'BNB/USDT.P', 'SOL/USDT.P', 'XRP/USDT.P',
            'ADA/USDT.P', 'AVAX/USDT.P', 'DOGE/USDT.P', 'TRX/USDT.P', 'LINK/USDT.P',
            'DOT/USDT.P', 'MATIC/USDT.P', 'LTC/USDT.P', 'BCH/USDT.P', 'UNI/USDT.P',
            'ATOM/USDT.P', 'XLM/USDT.P', 'ETC/USDT.P', 'FIL/USDT.P', 'HBAR/USDT.P',
            'LDO/USDT.P', 'APT/USDT.P', 'ARB/USDT.P', 'NEAR/USDT.P', 'QNT/USDT.P',
            'VET/USDT.P', 'MKR/USDT.P', 'GRT/USDT.P', 'AAVE/USDT.P', 'OP/USDT.P',
            'ALGO/USDT.P', 'STX/USDT.P', 'SAND/USDT.P', 'EOS/USDT.P', 'EGLD/USDT.P',
            'THETA/USDT.P', 'AXS/USDT.P', 'MANA/USDT.P', 'SNX/USDT.P', 'FTM/USDT.P'
        ]; // 40 symbols

        const timeframes = ['1m', '5m', '15m', '1h', '4h']; // 5 timeframes

        // 40 * 5 = 200 streams.
        // This will create ONE shard in binanceStream (limit 200).

        console.log(`Subscribing to ${symbols.length} symbols * ${timeframes.length} timeframes = ${symbols.length * timeframes.length} streams...`);

        await binanceStream.subscribe(symbols, timeframes);

        // Keep alive for 30 seconds
        setTimeout(() => {
            console.log('Test completed. Disconnecting...');
            binanceStream.disconnect();
            process.exit(0);
        }, 30000);

    } catch (error) {
        console.error('Error during test:', error);
        process.exit(1);
    }
}

run();
