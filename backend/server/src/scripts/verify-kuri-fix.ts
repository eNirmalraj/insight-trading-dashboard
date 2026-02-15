import { Kuri } from '../kuri/kuri';
import { Context } from '../kuri/interpreter';

// Mock Data
const context: Context = {
    close: [11, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10], // Length 11
    high: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10],
    low: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10],
    open: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10],
    volume: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
};

// 1. Strings Support & Vector Condition
// - Uses string literal "my_strategy"
// - Uses vector condition (close > 12)
// - Expects entry at index 3 (Value 13 > 12)
const script = `
entryCond = close > 12
strategy.entry("my_strategy", "LONG", entryCond)

closeCond = close < 11
strategy.close("my_strategy", closeCond)
`;

console.log('--- Testing Kuri VM Fixes ---');
try {
    const res = Kuri.executeWithVM(script, context as any);

    console.log('Signals:', JSON.stringify(res.signals, null, 2));

    // Validations
    const entries = res.signals.filter(s => s.type === 'ENTRY');
    const exits = res.signals.filter(s => s.type === 'EXIT');

    // 1. Check Entry
    // 10, 11, 12, 13, 14, 15...
    // > 12?
    // 10 (F), 11 (F), 12 (F), 13 (T) -> RISING EDGE at Index 3
    if (entries.length === 1 && entries[0].timestamp === 3) {
        console.log('✅ Entry Signal Correct (Index 3)');
    } else {
        console.error('❌ Entry Signal Failed', entries);
    }

    // 2. Check Exit
    // ... 14, 13, 12, 11, 10
    // < 11?
    // 11 (F), 10 (T) -> EXIT at Index 10
    if (exits.length === 1 && exits[0].timestamp === 10) {
        console.log('✅ Exit Signal Correct (Index 10)');
    } else {
        console.error('❌ Exit Signal Failed', exits);
    }

    if (entries.length === 1 && exits.length === 1) {
        console.log('SUCCESS: Kuri VM vector logic and strings are working.');
    } else {
        process.exit(1);
    }

} catch (e) {
    console.error('Kuri Execution Error:', e);
    process.exit(1);
}
