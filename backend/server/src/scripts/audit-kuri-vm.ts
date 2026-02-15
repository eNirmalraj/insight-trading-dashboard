import { Kuri } from '../kuri/kuri';
import { Context } from '../kuri/interpreter';

// --- AUDIT SUITE ---

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`❌ ASSERT FAILED: ${message}`);
    }
    console.log(`✅ ${message}`);
}

const context: Context = {
    close: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10], // Length 11
    high: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10],
    low: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10],
    open: [10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10],
    volume: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]
};

console.log('--- STARTING KURI VM DEEP AUDIT ---\n');

// ----------------------------------------
// SECTION 1: LEXER & STRING VALIDATION
// ----------------------------------------
console.log('--- SECTION 1: LEXER & STRINGS ---');
const stringScript = `
    s1 = "LONG"
    s2 = "My_Strategy_123"
    s3 = "Mixed CASE String"
    // s4 = "Escaped \"Quote\"" // Test this capability
    
    // Check if numeric parsing is broken by strings
    n1 = 123.45
`;

try {
    const res = Kuri.executeWithVM(stringScript, { ...context });
    assert(res.variables['s1'] === "LONG", "Basic String 'LONG'");
    assert(res.variables['s2'] === "My_Strategy_123", "Alphanumeric String");
    assert(res.variables['s3'] === "Mixed CASE String", "Mixed Case String");
    assert(res.variables['n1'] === 123.45, "Numeric Parsing unaffected");
} catch (e) {
    console.error("❌ Lexer Audit Failed:", e);
}

// ----------------------------------------
// SECTION 3 & 4: VECTOR EXECUTION & EDGE CASES
// ----------------------------------------
console.log('\n--- SECTION 3 & 4: VECTOR EXECUTION & EDGE CASES ---');
const vectorScript = `
    // 1. Normal Rising Edge
    // Index 3: 13 > 12 (True). Prev 12 > 12 (False). -> SIGNAL
    cond1 = close > 12
    strategy.entry("strat_1", "LONG", cond1)

    // 2. Continuous True (Should NOT signal repeatedly)
    // Index 3, 4, 5 all > 12. Only Index 3 should signal.
    
    // 3. Short Array / Undefined
    // If we accessed close[20], it would be undefined.
    // Let's rely on built-in safety of strict array access in VM for now.
`;

try {
    const res = Kuri.executeWithVM(vectorScript, { ...context });
    const signals = res.signals.filter(s => s.id === "strat_1");

    assert(signals.length === 1, `Rising Edge Only: Expected 1 signal, got ${signals.length}`);
    if (signals.length > 0) {
        assert(signals[0].timestamp === 3, `Signal at correct index 3 (Got ${signals[0].timestamp})`);
        assert(signals[0].direction === "LONG", "Direction is LONG");
    }
} catch (e) {
    console.error("❌ Vector Audit Failed:", e);
}

// ----------------------------------------
// SECTION 5: MULTIPLE STRATEGIES
// ----------------------------------------
console.log('\n--- SECTION 5: MULTIPLE STRATEGIES ---');
const multiScript = `
    // Strat A: Signal at Index 3
    condA = close > 12
    strategy.entry("Strat_A", "LONG", condA)

    // Strat B: Signal at Index 5
    // 15 > 14 (True). 
    condB = close > 14
    strategy.entry("Strat_B", "SHORT", condB)
`;

try {
    const res = Kuri.executeWithVM(multiScript, { ...context });
    const sigA = res.signals.filter(s => s.id === "Strat_A");
    const sigB = res.signals.filter(s => s.id === "Strat_B");

    assert(sigA.length === 1 && sigA[0].timestamp === 3, "Strat_A Independent State");
    assert(sigB.length === 1 && sigB[0].timestamp === 5, "Strat_B Independent State");
} catch (e) {
    console.error("❌ Multi-Strategy Audit Failed:", e);
}

// ----------------------------------------
// SECTION 6: PARITY CHECK (Condition passing)
// ----------------------------------------
console.log('\n--- SECTION 6: PARITY/RUNTIME CHECKS ---');
// Verify scalars still work too
const scalarScript = `
    // Force true always
    // Should trigger on Index 0 only (False -> True transition from init)
    strategy.entry("scalar_strat", "LONG", 1 == 1) 
`;

try {
    const res = Kuri.executeWithVM(scalarScript, { ...context });
    const sig = res.signals.filter(s => s.id === "scalar_strat");
    assert(sig.length === 1 && sig[0].timestamp === 0, "Scalar 'True' triggers Index 0 signal");
} catch (e) {
    console.error("❌ Scalar Fallback Audit Failed:", e);
}

// ----------------------------------------
// SECTION 7: SMA INTEGRATION (Complex Vector)
// ----------------------------------------
console.log('\n--- SECTION 7: SMA INTEGRATION ---');
// Close: 10, 11, 12, 13, 14, 15...
// SMA(3):
// Index 0: null
// Index 1: null
// Index 2: (10+11+12)/3 = 11. Close(12) > 11. (True) -> SIGNAL?
// Wait. 
// Index 0: 10. SMA null. 10 > null? False.
// Index 1: 11. SMA null. False.
// Index 2: 12. SMA 11. 12 > 11. TRUE. -> Rising Edge.
const smaScript = `
    cond = close > sma(close, 3)
    strategy.entry("sma_strat", "LONG", cond)
`;

try {
    const res = Kuri.executeWithVM(smaScript, { ...context });
    const sig = res.signals.filter(s => s.id === "sma_strat");
    assert(sig.length === 1, `SMA Strategy Signal count: ${sig.length}`);
    if (sig.length > 0) {
        assert(sig[0].timestamp === 2, `SMA Signal at Index 2 (Got ${sig[0].timestamp})`);
    }
} catch (e) {
    console.error("❌ SMA Integration Audit Failed:", e);
}

console.log('\n--- AUDIT COMPLETE ---');
