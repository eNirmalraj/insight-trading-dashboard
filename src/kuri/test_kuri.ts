import { Kuri } from './kuri';

const runTests = () => {
    // 1. Setup Mock Data (20 candles)
    // Prices increasing from 10 to 29
    const closes = Array.from({ length: 20 }, (_, i) => 10 + i);
    const context = {
        open: [],
        high: [],
        low: [],
        close: closes,
        volume: []
    };

    console.log("Mock Context Close Prices:", closes);

    // 2. Test Script
    const script = `
        // Test basic math
        val_ten = 5 + 5
        
        // Test SMA (period 5)
        my_sma = sma(close, 5)

        // Test RSI (period 5) - Mock
        my_rsi = rsi(close, 5)

        // Test Logic
        is_above = close > my_sma
    `;

    console.log("\n--- Running Kuri Script ---");
    console.log(script);
    console.log("---------------------------\n");

    try {
        const result = Kuri.execute(script, context);

        console.log("--- Execution Result ---");
        console.log("val_ten:", result.val_ten);
        console.log("my_sma (Last 5):", result.my_sma.slice(-5));
        console.log("my_rsi (Last 5):", result.my_rsi.slice(-5));
        console.log("is_above (Last 5):", result.is_above.slice(-5));

        // Verification
        if (result.val_ten === 10) console.log("✅ Math Test Passed");
        else console.error("❌ Math Test Failed");

        const lastSma = result.my_sma[19];
        // SMA of 25, 26, 27, 28, 29 = 27
        if (lastSma === 27) console.log("✅ SMA Test Passed");
        else console.error(`❌ SMA Test Failed. Expected 27, got ${lastSma}`);

    } catch (e) {
        console.error("❌ Execution Failed:", e);
    }
};

runTests();
