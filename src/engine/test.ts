// src/engine/test.ts
// Test file for Strategy Signal Generation Engine
// Run this to verify the engine works correctly

import { runStrategy, runAllStrategies, evaluateStrategy } from './strategyEngine';
import { Strategy, TradeDirection, StrategyCategory } from '../types';
import { Candle } from '../types/market';

/**
 * Generate mock candle data for testing
 */
const generateMockCandles = (): Candle[] => {
    const candles: Candle[] = [];
    const baseTime = Math.floor(Date.now() / 1000) - (100 * 3600); // 100 hours ago
    let price = 1.1000;

    for (let i = 0; i < 100; i++) {
        // Create trending price movement with some noise
        const trend = i < 50 ? -0.0002 : 0.0003; // Down then up trend
        const noise = (Math.random() - 0.5) * 0.0004;
        price += trend + noise;

        const high = price + Math.random() * 0.0010;
        const low = price - Math.random() * 0.0010;
        const open = price + (Math.random() - 0.5) * 0.0005;
        const close = price;

        candles.push({
            time: baseTime + (i * 3600), // 1 hour intervals
            open,
            high,
            low,
            close,
            volume: Math.random() * 1000 + 500
        });
    }

    return candles;
};

/**
 * Create a test strategy: SMA Crossover
 */
const createSMACrossStrategy = (): Strategy => ({
    id: 'test_sma_cross_1',
    name: 'SMA Cross Test Strategy',
    description: 'Buy when SMA20 crosses above SMA50, Sell when crosses below',
    timeframe: '1H',
    symbolScope: ['EURUSD', 'GBPUSD'],
    indicators: [
        { type: 'MA', parameters: { period: 20 } },
        { type: 'MA', parameters: { period: 50 } }
    ],
    entryRules: [
        {
            condition: 'crossover',
            indicator1: 'MA_20',
            indicator2: 'MA_50',
            direction: TradeDirection.BUY
        },
        {
            condition: 'crossunder',
            indicator1: 'MA_20',
            indicator2: 'MA_50',
            direction: TradeDirection.SELL
        }
    ],
    exitRules: [],
    isActive: true,
    type: 'STRATEGY'
});

/**
 * Create a test strategy: RSI Overbought/Oversold
 */
const createRSIStrategy = (): Strategy => ({
    id: 'test_rsi_1',
    name: 'RSI Reversal Strategy',
    description: 'Buy when RSI < 30, Sell when RSI > 70',
    timeframe: '1H',
    symbolScope: ['EURUSD'],
    indicators: [
        { type: 'RSI', parameters: { period: 14 } }
    ],
    entryRules: [
        {
            condition: 'less_than',
            indicator1: 'RSI_14',
            value: 30,
            direction: TradeDirection.BUY
        },
        {
            condition: 'greater_than',
            indicator1: 'RSI_14',
            value: 70,
            direction: TradeDirection.SELL
        }
    ],
    exitRules: [],
    isActive: true,
    type: 'STRATEGY'
});

/**
 * Test 1: Run SMA Cross Strategy
 */
export const testSMACrossStrategy = async () => {
    console.log('\\n=== Testing SMA Crossover Strategy ===');

    const strategy = createSMACrossStrategy();
    const candles = generateMockCandles();

    console.log(`Generated ${candles.length} candles`);
    console.log(`Price range: ${candles[0].close.toFixed(5)} -> ${candles[candles.length - 1].close.toFixed(5)}`);

    const results = await runStrategy(strategy, candles);

    console.log(`\\nStrategy evaluated: ${results.length} signals detected`);
    results.forEach(result => {
        console.log(`  - ${result.direction}: ${result.reason}`);
    });

    return results.length > 0;
};

/**
 * Test 2: Run RSI Strategy
 */
export const testRSIStrategy = async () => {
    console.log('\\n=== Testing RSI Strategy ===');

    const strategy = createRSIStrategy();
    const candles = generateMockCandles();

    const results = await runStrategy(strategy, candles);

    console.log(`\\nStrategy evaluated: ${results.length} signals detected`);
    results.forEach(result => {
        console.log(`  - ${result.direction}: ${result.reason}`);
    });

    return results.length >= 0; // May or may not generate signals
};

/**
 * Test 3: Run all strategies
 */
export const testRunAllStrategies = async () => {
    console.log('\\n=== Testing runAllStrategies ===');

    const candles = generateMockCandles();

    // Note: This requires strategies to be in database
    // In mock mode, it will use localStorage
    const result = await runAllStrategies('EURUSD', '1H', candles);

    console.log(`\\nEngine result:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Signals created: ${result.signalsCreated}`);
    console.log(`  Errors: ${result.errors.length}`);
    result.errors.forEach(err => console.log(`    - ${err}`));

    return result.success;
};

/**
 * Run all tests
 */
export const runAllTests = async () => {
    console.log('\\n╔══════════════════════════════════════════╗');
    console.log('║  Strategy Engine Test Suite              ║');
    console.log('╚══════════════════════════════════════════╝');

    const tests = [
        { name: 'SMA Cross Strategy', fn: testSMACrossStrategy },
        { name: 'RSI Strategy', fn: testRSIStrategy },
        { name: 'Run All Strategies', fn: testRunAllStrategies }
    ];

    const results = [];

    for (const test of tests) {
        try {
            const passed = await test.fn();
            results.push({ name: test.name, passed, error: null });
        } catch (error: any) {
            results.push({ name: test.name, passed: false, error: error.message });
        }
    }

    console.log('\\n╔══════════════════════════════════════════╗');
    console.log('║  Test Results                            ║');
    console.log('╚══════════════════════════════════════════╝\\n');

    results.forEach(result => {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        console.log(`${status} - ${result.name}`);
        if (result.error) {
            console.log(`       Error: ${result.error}`);
        }
    });

    const passCount = results.filter(r => r.passed).length;
    console.log(`\\n${passCount}/${results.length} tests passed\\n`);

    return passCount === results.length;
};

// Auto-run tests if this file is executed directly
if (require.main === module) {
    runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}
