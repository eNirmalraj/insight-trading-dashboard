
import { fetchHistoricalCandles, startCryptoEngine } from '../engine/cryptoEngine';
import { runAllBuiltInStrategies } from '../engine/strategyEngine';
import { saveSignal } from '../services/signalStorage';
import { binanceStream } from '../services/binanceStream';
import { TradeDirection } from '../constants/builtInStrategies'; // Import Enum
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function traceSignalFlow() {
    console.log('--- STARTING TRACE ---');
    const symbol = 'BTC/USDT.P';
    const timeframe = '1m'; // Fast timeframe

    try {
        // 1. Fetch Candles
        console.log(`[1] Fetching candles for ${symbol}...`);
        const candles = await fetchHistoricalCandles(symbol, timeframe, 200);
        console.log(`[1] Fetched ${candles.length} candles.`);

        if (candles.length < 50) {
            console.error('[ERROR] Not enough candles!');
            return;
        }

        // 2. Run Strategies
        console.log('[2] Running strategies...');
        const results = runAllBuiltInStrategies(candles);
        console.log(`[2] Strategy Results: ${results.length} potentials.`);

        results.forEach(r => {
            console.log(`   > Strategy: ${r.strategyName}, Signal: ${r.wouldSignal}, Dir: ${r.direction}`);
        });

        if (results.length === 0) {
            console.log('[INFO] No signals generated from historical data. This might be normal if market is flat.');
            // Let's force a fake signal to test saving
            console.log('[TEST] Forcing a fake signal to test DB save...');
            results.push({
                wouldSignal: true,
                direction: TradeDirection.BUY, // FIXED: Use Enum
                reason: 'Trace Test',
                strategyId: 'test-strategy-id',
                strategyName: 'Trace Test Strategy',
                exitRules: []
            } as any);
        }

        // 3. Test Save (Dry Run or Actual?)
        // We will try to save the first result if any
        if (results.length > 0) {
            const signal = results[0];
            console.log(`[3] Attempting to save signal: ${signal.strategyName}`);

            // Mocking SignalData
            const signalData = {
                symbol: symbol,
                strategy: signal.strategyName,
                strategyId: signal.strategyId,
                strategyCategory: 'Test',
                direction: signal.direction,
                entryPrice: candles[candles.length - 1].close,
                stopLoss: null,
                takeProfit: null,
                timeframe: timeframe,
                status: 'Active'
            };

            console.log('Signal Payload:', JSON.stringify(signalData, null, 2));

            // Uncomment to actually save
            const id = await saveSignal(signalData as any);
            console.log(`[3] Save Result ID: ${id}`);
        }

    } catch (error) {
        console.error('[ERROR] Trace failed:', error);
    }
}

traceSignalFlow();
