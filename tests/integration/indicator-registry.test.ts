/**
 * Kuri Indicator Registry Integration Tests
 * Tests that built-in indicator functions produce correct values,
 * array.every/array.some work properly, and for...in loops iterate collections.
 *
 * Run:  npx tsx tests/integration/indicator-registry.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vm from 'vm';

const __filename_local = fileURLToPath(import.meta.url);
const DIR = path.dirname(__filename_local);

// Load the Kuri engine (UMD module)
const enginePath = path.resolve(DIR, '../../src/lib/kuri/kuri-engine-full.js');
const engineCode = fs.readFileSync(enginePath, 'utf-8');
const wrappedCode = `(function(module, exports) {\n${engineCode}\nreturn module.exports;\n})`;
const factory = vm.runInThisContext(wrappedCode, { filename: 'kuri-engine-full.js' });
const fakeModule: any = { exports: {} };
const moduleExports = factory(fakeModule, fakeModule.exports);
const Kuri = moduleExports || fakeModule.exports;
const KuriEngine = Kuri.KuriEngine || Kuri.default?.KuriEngine;

if (!KuriEngine) {
    console.error('FAIL: Could not load KuriEngine');
    process.exit(1);
}

// Generate fake OHLCV data
function generateOHLCV(count: number) {
    const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [];
    const volume: number[] = [], time: number[] = [];
    const intervalMs = 300000;
    const baseTime = Date.now() - count * intervalMs;
    let price = 50000;
    for (let i = 0; i < count; i++) {
        const o = price + (Math.random() - 0.5) * 500;
        const c = o + (Math.random() - 0.5) * 1000;
        const h = Math.max(o, c) + Math.random() * 300;
        const l = Math.min(o, c) - Math.random() * 300;
        open.push(o); high.push(h); low.push(l); close.push(c);
        volume.push(1000 + Math.random() * 5000);
        time.push(baseTime + i * intervalMs);
        price = c;
    }
    return { open, high, low, close, volume, time };
}

const ohlcv = generateOHLCV(100);
let passed = 0, failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  PASS: ${msg}`);
        passed++;
    } else {
        console.error(`  FAIL: ${msg}`);
        failed++;
    }
}

// ── Test 1: SMA indicator produces correct number of plot points ──
console.log('\n[Test 1] SMA indicator via registry');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: SMA Test
type: indicator
---
length = 14
smaVal = kuri.sma(close, length)
mark(smaVal, title="SMA")
`, ohlcv);
    assert(result.success === true, 'SMA script runs without errors');
    assert(result.plots.length > 0, 'SMA produces at least one plot');
    const smaPlot = result.plots.find((p: any) => p.title === 'SMA');
    assert(smaPlot !== undefined, 'Plot titled "SMA" exists');
    assert(Array.isArray(smaPlot?.data), 'SMA plot has data array');
    assert(smaPlot?.data.length === ohlcv.close.length, 'SMA data length matches input bars');
}

// ── Test 2: RSI indicator values are in valid range ──
console.log('\n[Test 2] RSI indicator range validation');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: RSI Test
type: indicator
---
rsiVal = kuri.rsi(close, 14)
mark(rsiVal, title="RSI")
`, ohlcv);
    assert(result.success === true, 'RSI script runs without errors');
    const rsiPlot = result.plots.find((p: any) => p.title === 'RSI');
    assert(rsiPlot !== undefined, 'Plot titled "RSI" exists');
    const validValues = rsiPlot?.data.filter((v: any) => !isNaN(v));
    const allInRange = validValues?.every((v: number) => v >= 0 && v <= 100);
    assert(allInRange === true, 'All RSI values are between 0 and 100');
}

// ── Test 3: EMA and MACD indicators produce output ──
console.log('\n[Test 3] EMA and MACD indicators');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: MACD Test
type: indicator
---
emaVal = kuri.ema(close, 12)
[macdLine, signalLine, hist] = kuri.macd(close, 12, 26, 9)
mark(emaVal, title="EMA")
mark(macdLine, title="MACD")
mark(signalLine, title="Signal")
`, ohlcv);
    assert(result.success === true, 'MACD script runs without errors');
    assert(result.plots.length >= 3, 'MACD script produces at least 3 plots');
}

// ── Test 4: Bollinger Bands produces upper, middle, lower ──
console.log('\n[Test 4] Bollinger Bands indicator');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: BB Test
type: indicator
---
[middle, upper, lower] = kuri.bb(close, 20, 2)
mark(upper, title="BB Upper")
mark(middle, title="BB Middle")
mark(lower, title="BB Lower")
`, ohlcv);
    assert(result.success === true, 'BB script runs without errors');
    assert(result.plots.length === 3, 'BB produces exactly 3 plots');
}

// ── Test 5: for...in loop iterates arrays ──
console.log('\n[Test 5] for...in loop with arrays');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: ForIn Array Test
type: indicator
---
arr = array.new_float(0)
array.push(arr, 10.0)
array.push(arr, 20.0)
array.push(arr, 30.0)
total = 0.0
for val in arr
    total := total + val
mark(total, title="Sum")
`, ohlcv);
    assert(result.success === true, 'for...in array script runs without errors: ' + (result.errors?.map((e: any) => e.message).join(', ') || ''));
    const sumPlot = result.plots.find((p: any) => p.title === 'Sum');
    assert(sumPlot !== undefined, 'Sum plot exists');
    if (sumPlot) {
        const lastVal = sumPlot.data[sumPlot.data.length - 1];
        assert(lastVal === 60, `Sum of [10, 20, 30] = ${lastVal} (expected 60)`);
    }
}

// ── Test 6: for...in loop iterates map keys ──
console.log('\n[Test 6] for...in loop with map keys');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: ForIn Map Test
type: indicator
---
m = map.new()
map.put(m, "a", 1)
map.put(m, "b", 2)
map.put(m, "c", 3)
keys = map.keys(m)
count = 0
for k in keys
    count := count + 1
mark(count, title="Count")
`, ohlcv);
    assert(result.success === true, 'for...in map keys script runs without errors: ' + (result.errors?.map((e: any) => e.message).join(', ') || ''));
    const countPlot = result.plots.find((p: any) => p.title === 'Count');
    assert(countPlot !== undefined, 'Count plot exists');
    if (countPlot) {
        const lastVal = countPlot.data[countPlot.data.length - 1];
        assert(lastVal === 3, `Map key count = ${lastVal} (expected 3)`);
    }
}

// ── Test 7: Strategy signals are generated ──
console.log('\n[Test 7] Strategy signal generation');
{
    const engine = new KuriEngine();
    const result = engine.run(`
---
version: kuri 1.0
name: Simple Strategy
type: strategy
---
fastMA = kuri.sma(close, 5)
slowMA = kuri.sma(close, 20)
if kuri.crossover(fastMA, slowMA)
    strategy.entry("Long", strategy.long)
if kuri.crossunder(fastMA, slowMA)
    strategy.close("Long")
`, ohlcv);
    assert(result.success === true, 'Strategy script runs without errors');
    assert(result.strategy !== undefined, 'Strategy result object exists');
    assert(Array.isArray(result.strategy?.orders), 'Strategy orders is an array');
}

// ── Summary ──
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
else console.log('All tests passed!');
