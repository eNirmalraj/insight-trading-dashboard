import ccxt from 'ccxt';
import WebSocket from 'ws';

const verifyPerpetualLogic = async () => {
    console.log('🔍 Verifying Perpetual (.P) Suffix Logic...');

    const exchange = new ccxt.binance({
        options: { defaultType: 'future' }
    });
    // Timeout to fail fast
    exchange.timeout = 5000;

    // 1. Verify Historical Data Fetch with Suffix Logic
    const symbolWithSuffix = 'BTC/USDT.P';
    console.log(`\n1. Testing Historical Data for: ${symbolWithSuffix}`);

    // LOGIC FROM cryptoEngine.ts
    let formattedSymbol = symbolWithSuffix;
    if (symbolWithSuffix.endsWith('.P')) {
        const base = symbolWithSuffix.replace('.P', '').split('/')[0]; // BTC
        formattedSymbol = `${base}/USDT`;
        console.log(`   ℹ️ Logic Transformed ${symbolWithSuffix} -> ${formattedSymbol}`);
    } else {
        console.error('   ❌ Logic failed to detect .P suffix (Test Logic Error)');
    }

    try {
        const ohlcv = await exchange.fetchOHLCV(formattedSymbol, '15m', undefined, 5);
        if (ohlcv.length > 0) {
            console.log(`   ✅ Success! Fetched ${ohlcv.length} candles using transformed symbol.`);
            console.log(`      Latest Close: ${ohlcv[ohlcv.length - 1][4]}`);
        } else {
            console.error('   ❌ Fetched 0 candles.');
        }
    } catch (e: any) {
        console.error(`   ❌ API Error: ${e.message}`);
    }

    // 2. Verify Real-time Stream Normalization
    console.log(`\n2. Testing Stream Normalization Logic`);
    const streamSymbol = 'btcusdt';
    const streamUrl = `wss://fstream.binance.com/stream?streams=${streamSymbol}@kline_1m`;

    console.log(`   🔌 Connecting to ${streamUrl}`);
    const ws = new WebSocket(streamUrl);

    ws.on('open', () => {
        console.log('   ✅ WebSocket Connected. Waiting for data...');
    });

    ws.on('message', (data: any) => {
        const message = JSON.parse(data.toString());
        if (message.data?.e === 'kline') {
            const rawSymbol = message.data.s; // BTCUSDT

            // LOGIC FROM binanceStream.ts
            // "if (this.baseUrl.includes('fstream') && symbol.endsWith('USDT'))"
            let normalized = rawSymbol;
            if (rawSymbol.endsWith('USDT')) {
                const base = rawSymbol.substring(0, rawSymbol.length - 4); // BTC
                normalized = `${base}/USDT.P`;
            }

            console.log(`   ✅ Received Raw: ${rawSymbol}`);
            console.log(`   ℹ️ Logic Normalized to: ${normalized}`);

            if (normalized === 'BTC/USDT.P') {
                console.log('   ✅ Verification Passed: Symbol matches expected application format.');
            } else {
                console.error(`   ❌ Verification Failed: Expected BTC/USDT.P, got ${normalized}`);
            }

            ws.terminate();
            process.exit(0);
        }
    });

    setTimeout(() => {
        console.error('   ❌ Timeout waiting for stream data.');
        ws.terminate();
        process.exit(1);
    }, 10000);
};

verifyPerpetualLogic().catch(console.error);
