
import ccxt from 'ccxt';
import { runAllBuiltInStrategies } from '../engine/strategyEngine';
import { Candle } from '../engine/indicators';

const verifySignals = async () => {
    console.log('Starting Signal Verification...');

    // 1. Fetch Real Data
    const exchange = new ccxt.binance({ options: { defaultType: 'future' } });
    const symbol = 'BTC/USDT';
    const timeframe = '15m';

    console.log(`Fetching ${timeframe} candles for ${symbol}...`);
    const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 200);

    const candles: Candle[] = ohlcv.map(c => ({
        time: Math.floor((c[0] || Date.now()) / 1000),
        open: c[1] || 0,
        high: c[2] || 0,
        low: c[3] || 0,
        close: c[4] || 0,
        volume: c[5] || 0
    }));

    console.log(`Loaded ${candles.length} candles.`);

    // 2. Run Strategies
    console.log('Running strategies...');
    const signals = runAllBuiltInStrategies(candles);

    // 3. Output Results
    console.log(`Generated ${signals.length} signals.`);
    if (signals.length > 0) {
        console.table(signals.map(s => ({
            Strategy: s.strategyName,
            Direction: s.direction,
            Reason: s.reason,
            TP: s.exitRules?.find(r => r.type === 'TAKE_PROFIT')?.value,
            SL: s.exitRules?.find(r => r.type === 'STOP_LOSS')?.value
        })));
    } else {
        console.warn('⚠️ No signals generated! Logic might be too strict or broken.');
    }
};

verifySignals().catch(console.error);
