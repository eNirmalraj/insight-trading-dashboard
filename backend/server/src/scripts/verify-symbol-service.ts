// Verify symbolService converters
import { parseSymbol, toCCXT, toBinanceWS, toDisplay, equals } from '../services/symbolService';
import { Market } from '../constants/enums';

const cases = [
    { input: 'BTC/USDT.P', expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'BTCUSDT.P',  expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'BTC/USDT',   expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'BTCUSDT',    expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'btcusdt',    expected: { symbol: 'BTCUSDT', market: Market.FUTURES } },
    { input: 'ETHUSDT',    expected: { symbol: 'ETHUSDT', market: Market.FUTURES } },
];

let failed = 0;
for (const { input, expected } of cases) {
    const result = parseSymbol(input);
    if (result.symbol !== expected.symbol || result.market !== expected.market) {
        console.error(`❌ parseSymbol('${input}') = ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`);
        failed++;
    } else {
        console.log(`✅ parseSymbol('${input}') = ${JSON.stringify(result)}`);
    }
}

// Converters
const btc = parseSymbol('BTC/USDT.P');
console.log(`\nConverters for ${JSON.stringify(btc)}:`);
console.log(`  toCCXT       = ${toCCXT(btc)}`);
console.log(`  toBinanceWS  = ${toBinanceWS(btc)}`);
console.log(`  toDisplay    = ${toDisplay(btc)}`);

// Equality
const same = equals(parseSymbol('BTCUSDT'), parseSymbol('BTC/USDT'));
console.log(`\nequals BTCUSDT vs BTC/USDT = ${same}`);

if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
}
console.log('\n✅ All symbol service tests passed');
