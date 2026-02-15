
import { Kuri } from './kuri';
import { Context } from './interpreter';

// Mock Data
const close = [100, 101, 102, 103, 102, 101, 100, 99, 98, 99, 100, 101, 102];
const high = close.map(c => c + 1);
const low = close.map(c => c - 1);
const open = close.map(c => c - 0.5);

const context: Context = {
    open, high, low, close, volume: close.map(() => 1000)
};

// Test Script 1: History Access
const script1 = `
    prev_close = close[1]
    is_rising = close > prev_close
`;

console.log("--- Test 1: History Access ---");
try {
    const result1 = Kuri.executeWithVM(script1, context);
    console.log("Variables (Current Context):", result1.variables.prev_close);
    // BackendVM returns final context. 
    // result1.variables is the context at the END of execution.
    // To check history, we should inspect the context arrays if they were updated, 
    // BUT variables in BackendVM are scalars for the current bar in the loop?
    // No, executeAssign does: this.context[node.name] = value;
    // If value is a scalar, it overwrites.
    // If we want to test correct execution, we should probably output the signals or check final state.
    // For V2 history access verification:
    // If close[1] works, prev_close should be the value of close at index (N-1).
    // At the end of the loop, currentIndex is N-1.
    // So prev_close should be close[N-2].
} catch (e) {
    console.error("Test 1 Failed:", e);
}

// Test Script 2: New Indicators (MACD)
const script2 = `
    my_macd = macd(close, 3, 6, 3)
`;
console.log("\n--- Test 2: MACD ---");
try {
    const result2 = Kuri.executeWithVM(script2, context);
    console.log("MACD (Last Value):", result2.variables.my_macd);
} catch (e) {
    console.error("Test 2 Failed:", e);
}

// Test Script 3: Rising Edge Detection
const script3 = `
    condition = close > 100
    strategy.entry("test_id", "LONG", condition)
`;
console.log("\n--- Test 3: Rising Edge Detection ---");
try {
    const result3 = Kuri.executeWithVM(script3, context);
    console.log("Signals Generated:", result3.signals.length);

    if (result3.signals.length !== 2) {
        throw new Error(`Expected 2 signals (Rising Edge), but got ${result3.signals.length}`);
    }
    console.log("✅ Rising Edge Verification Successful!");

} catch (e) {
    console.error("Test 3 Failed:", e);
    process.exit(1);
}
