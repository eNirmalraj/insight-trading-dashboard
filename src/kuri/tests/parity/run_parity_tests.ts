/**
 * Kuri v1 Parity Test Harness
 * 
 * Main test orchestrator that runs Kuri scripts in both Frontend and Backend VMs
 * and asserts exact parity between results.
 * 
 * Usage: npx ts-node src/kuri/tests/parity/run_parity_tests.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runFrontendVM } from './runners/frontendRunner.ts';
import { runBackendVM } from './runners/backendRunner.ts';
import { ParityAsserter } from './assertions/parityAsserter.ts';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestCase {
    name: string;
    scriptPath: string;
    indicators: string[];
    checkSignals?: boolean;
}

async function runParityTests() {
    console.log('🔍 Kuri v1 Parity Test Harness');
    console.log('='.repeat(60));
    console.log('');

    // Load candle fixtures
    const candlesPath = join(__dirname, 'fixtures', 'candles.json');
    const candles = JSON.parse(readFileSync(candlesPath, 'utf-8'));
    console.log(`📊 Loaded ${candles.length} candles from fixture`);
    console.log('');

    // Define test cases
    const tests: TestCase[] = [
        {
            name: 'Indicator Only',
            scriptPath: join(__dirname, 'scripts', 'indicator_only.kuri'),
            indicators: ['ema20', 'sma50', 'rsi_val']
        },
        {
            name: 'Strategy Entry',
            scriptPath: join(__dirname, 'scripts', 'strategy_entry.kuri'),
            indicators: ['ema20', 'buy_signal'],
            checkSignals: true
        },
        {
            name: 'Strategy Full',
            scriptPath: join(__dirname, 'scripts', 'strategy_full.kuri'),
            indicators: ['fast', 'slow', 'buy', 'sell'],
            checkSignals: true
        }
    ];

    let allPassed = true;
    const results: { test: string; passed: boolean; errors: string[] }[] = [];

    for (const test of tests) {
        console.log(`📝 Test: ${test.name}`);
        console.log('-'.repeat(60));

        try {
            // Load script
            const script = readFileSync(test.scriptPath, 'utf-8');
            console.log(`   Script: ${test.scriptPath.split('/').pop()}`);

            // Execute in Frontend VM
            console.log('   Executing in Frontend VM...');
            const frontendResult = await runFrontendVM(script, candles);

            // Execute in Backend VM
            console.log('   Executing in Backend VM...');
            const backendResult = await runBackendVM(script, candles);

            // Assert indicator parity
            console.log('   Checking indicator parity...');
            const indicatorParity = ParityAsserter.assertIndicatorParity(
                frontendResult.variables,
                backendResult.variables,
                test.indicators
            );

            console.log(ParityAsserter.formatResult('Indicators', indicatorParity));

            if (!indicatorParity.passed) {
                allPassed = false;
                results.push({
                    test: test.name,
                    passed: false,
                    errors: indicatorParity.errors
                });
            }

            // Assert signal parity (if applicable)
            let signalParity: any = { passed: true };
            if (test.checkSignals) {
                console.log('   Checking signal parity...');
                signalParity = ParityAsserter.assertSignalParity(
                    frontendResult.signals || [],
                    backendResult.signals || []
                );

                console.log(ParityAsserter.formatResult('Signals', signalParity));

                if (!signalParity.passed) {
                    allPassed = false;
                    if (results[results.length - 1]?.test === test.name) {
                        results[results.length - 1].errors.push(...signalParity.errors);
                    } else {
                        results.push({
                            test: test.name,
                            passed: false,
                            errors: signalParity.errors
                        });
                    }
                }
            }

            if (indicatorParity.passed && (!test.checkSignals || signalParity.passed)) {
                results.push({
                    test: test.name,
                    passed: true,
                    errors: []
                });
            }

            console.log('');
        } catch (error) {
            console.log(`  ❌ FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
            console.log('');
            allPassed = false;
            results.push({
                test: test.name,
                passed: false,
                errors: [error instanceof Error ? error.message : String(error)]
            });
        }
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📊 PARITY TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('');

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;

    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passedCount} ✅`);
    console.log(`Failed: ${failedCount} ❌`);
    console.log('');

    if (allPassed) {
        console.log('🎉 ALL PARITY TESTS PASSED');
        console.log('');
        console.log('Kuri v1 frontend/backend parity harness implemented and passing.');
        process.exit(0);
    } else {
        console.log('💥 PARITY TESTS FAILED');
        console.log('');
        console.log('Failed tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`\n  ${r.test}:`);
            r.errors.slice(0, 3).forEach(e => console.log(`    ${e}`));
            if (r.errors.length > 3) {
                console.log(`    ... and ${r.errors.length - 3} more errors`);
            }
        });
        console.log('');
        process.exit(1);
    }
}

// Run tests
runParityTests().catch(err => {
    console.error('💥 FATAL ERROR:', err);
    console.error(err.stack);
    process.exit(1);
});
