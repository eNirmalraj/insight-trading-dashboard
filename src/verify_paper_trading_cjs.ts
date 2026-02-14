
// Verification Script for Paper Trading Execution Layer (CommonJS version)
const { createSignal, closeSignal } = require('./services/signalService');
const { supabase } = require('./services/supabaseClient');
const { SignalStatus, TradeDirection, EntryType } = require('./types');
const { createPaperTrade } = require('./services/paperTradingService');

async function verifyPaperTrading() {
    console.log("Starting Paper Trading Verification...");

    // 1. Setup Test Strategy (if needed) or use existing
    const { data: strategy } = await supabase.from('strategies').select('id, user_id').limit(1).single();
    if (!strategy) {
        console.error("No strategy found for testing.");
        return;
    }
    console.log("Using Strategy:", strategy.id);

    // 2. Create Signal (ACTIVE) -> Should trigger Open Position
    const signalData = {
        pair: 'BTCUSDT',
        strategy: 'Test Strategy',
        strategyId: strategy.id,
        direction: 'BUY', // TradeDirection.BUY
        entry: 50000,
        entryType: 'Market', // EntryType.MARKET
        stopLoss: 49000,
        takeProfit: 52000,
        status: 'Active', // SignalStatus.ACTIVE
        timestamp: new Date().toISOString(),
        timeframe: '1H'
    };

    console.log("Creating Signal...");
    // Mocking the input strictly as needed by createSignal
    // The service expects Omit<Signal, 'id'>
    try {
        const signal = await createSignal(signalData);
        console.log("Signal Created:", signal.id);

        // Wait for async processing
        await new Promise(r => setTimeout(r, 2000));

        // 3. Check Paper Trade
        const { data: trade } = await supabase
            .from('paper_trades')
            .select('*')
            .eq('signal_id', signal.id)
            .single();

        if (trade) {
            console.log("✅ Trade Created Successfully:", trade.id);
            console.log("   Status:", trade.status);
            console.log("   Entry:", trade.entry_price);
        } else {
            console.error("❌ Trade Creation FAILED");
        }

        // 4. Test Idempotency
        console.log("Testing Idempotency...");
        const duplicateTradeId = await createPaperTrade(signal, strategy.user_id);

        if (duplicateTradeId === trade?.id) {
            console.log("✅ Idempotency Passed: Returned existing trade ID.");
        } else {
            console.error("❌ Idempotency FAILED: Created duplicate or returned mismatch.");
        }

        // 5. Close Signal -> Should Close Trade
        console.log("Closing Signal...");
        await closeSignal(signal.id, 'MANUAL');

        // Wait for async db ops
        await new Promise(r => setTimeout(r, 2000));

        // 6. Verify Trade Closed
        const { data: closedTrade } = await supabase
            .from('paper_trades')
            .select('*')
            .eq('id', trade.id)
            .single();

        if (closedTrade && closedTrade.status === 'Closed') {
            console.log("✅ Trade Closed Successfully.");
            console.log("   Exit Reason:", closedTrade.exit_reason);
        } else {
            console.error("❌ Trade Close FAILED. Status:", closedTrade?.status);
        }

    } catch (e) {
        console.error("Verification Error:", e);
    }
}

verifyPaperTrading();
