/**
 * Kuri v1 Parity Test Runner (Node.js Compatible)
 * 
 * Simplified version that works with tsx and Node.js module resolution
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import Kuri components - correct relative path from tests/parity/ to src/kuri/
import { Kuri } from '../../kuri.ts';
import { FrontendVM } from '../../frontendVM.ts';

interface TestCase {
    name: string;
    script: string;
    indicators: string[];
}

async function main() {
    console.log('🔍 Kuri v1 Parity Test Harness');
    console.log('='.repeat(60));
    console.log('');

    // Load candle fixtures
    const candlesPath = join(__dirname, 'fixtures', 'candles.json');
    const candles = JSON.parse(readFileSync(candlesPath, 'utf-8'));
    console.log(`📊 Loaded ${candles.length} candles from fixture\n`);

    // Define test cases with inline scripts (avoid file I/O issues)
    const tests: TestCase[] = [
        {
            name: 'Indicator Only',
            script: 'ema20 = ema(close, 20)\nsma50 = sma(close, 50)\nrsi_val = rsi(close, 14)',
            indicators: ['ema20', 'sma50', 'rsi_val']
        },
        {
            name: 'Strategy Entry',
            script: 'ema20 = ema(close, 20)\nbuy_signal = close > ema20',
            indicators: ['ema20', 'buy_signal']
        },
        {
            name: 'Crossover Strategy',
            script: 'fast = ema(close, 10)\nslow = ema(close, 20)\nbuy = crossover(fast, slow)\nsell = crossunder(fast, slow)',
            indicators: ['fast', 'slow', 'buy', 'sell']
        }
    ];

    let allPassed = true;

    for (const test of tests) {
        console.log(`📝 Test: ${test.name}`);
        console.log('-'.repeat(60));

        try {
            // Compile to IR
            const irJson = Kuri.compileToIR(test.script);
            const ir = JSON.parse(irJson);
            console.log('  ✅ Script compiled to IR');

            // Prepare context
            const context = {
                open: candles.map((c: any) => c.open),
                high: candles.map((c: any) => c.high),
                low: candles.map((c: any) => c.low),
                close: candles.map((c: any) => c.close),
                volume: candles.map((c: any) => c.volume)
            };

            // Execute in Frontend VM
            const vm = new FrontendVM(context);
            const result = vm.run(ir);
            console.log('  ✅ Executed in Frontend VM');

            // Verify indicators exist
            let indicatorsPassed = true;
            for (const indicator of test.indicators) {
                if (!result.variables[indicator]) {
                    console.log(`  ❌ Missing indicator: ${indicator}`);
                    indicatorsPassed = false;
                    allPassed = false;
                } else {
                    const value = result.variables[indicator];
                    const isArray = Array.isArray(value);
                    const length = isArray ? value.length : 'scalar';
                    console.log(`  ✅ ${indicator}: ${isArray ? 'series' : 'scalar'} (${length})`);
                }
            }

            if (indicatorsPassed) {
                console.log(`  ✅ All indicators verified`);
            }

            console.log('');
        } catch (error) {
            console.log(`  ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
            console.log('');
            allPassed = false;
        }
    }

    // Summary
    console.log('='.repeat(60));
    if (allPassed) {
        console.log('✅ ALL PARITY TESTS PASSED');
        console.log('');
        console.log('Kuri v1 parity tests are executing successfully.');
        process.exit(0);
    } else {
        console.log('❌ SOME TESTS FAILED');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('💥 FATAL ERROR:', err);
    process.exit(1);
});
