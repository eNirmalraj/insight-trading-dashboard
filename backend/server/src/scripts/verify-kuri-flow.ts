import { Kuri } from '../kuri/kuri';
import { Context } from '../kuri/interpreter';

const context: Context = {
    close: [10, 20, 30, 40],
    high: [10, 20, 30, 40],
    low: [10, 20, 30, 40],
    open: [10, 20, 30, 40],
    volume: [100, 100, 100, 100],
    // Workaround for Lexer missing string support:
    LONG: "LONG",
    SHORT: "SHORT",
    test_id: "test_id",
    TRUE: true
};

const scriptBooleanOnly = `
fast = close
slow = 15
// This boolean variable should just be a variable
myBool = fast > slow
`;

const scriptWithEntry = `
fast = close
slow = 15
// Force scalar using context var
strategy.entry(test_id, LONG, TRUE)
`;

console.log('--- Test 1: Boolean Variable Only ---');
try {
    const res1 = Kuri.executeWithVM(scriptBooleanOnly, context as any);
    console.log('Test 1 Signals:', res1.signals);
    // console.log('Variables:', res1.variables);
} catch (e) {
    console.error('Test 1 Failed:', e);
}

console.log('\n--- Test 2: Strategy Entry ---');
try {
    const res2 = Kuri.executeWithVM(scriptWithEntry, context as any);
    console.log('Signals (should have entry):', res2.signals);
} catch (e) {
    console.error('Test 2 Failed:', e);
}
