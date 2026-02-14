
// Verification Script for Paper Trading Execution Layer
import 'dotenv/config'; // Load env vars
import { createSignal, closeSignal } from './services/signalService';
import { supabase } from './services/supabaseClient';
import { SignalStatus, TradeDirection, EntryType, Timeframe } from './types';
import { createPaperTrade, closePaperTrade } from './services/paperTradingService'; // Import here

console.log("Script started...");

async function verifyPaperTrading() {
    console.log("Starting Paper Trading Verification...");
    try {

        // ... (rest of function)

        // 1. Setup Test Strategy (if needed) or use existing
        // Hardcoded from DB to bypass RLS/Creation issues in test script
        const strategyId = '11111111-1111-1111-1111-111111111111';
        const userId = '9d26ad9c-949e-4aec-8a24-91c6fc122afd';
        console.log("Using Hardcoded Strategy:", strategyId);


        // 2. Create Signal (ACTIVE) -> Should trigger Open Position
        // Hardcoded signal from DB
        const signalId = '921ccfe4-5088-48fc-a8f1-7a7204fa3559';

        console.log("Using Existing Active Signal:", signalId);

        const { data: signals, error: signalError } = await supabase
            .from('signals')
            .select('*')
            .eq('id', signalId)
            .limit(1);

        if (signalError || !signals || signals.length === 0) {
            console.error("Failed to fetch test signal. Error:", signalError?.message, "Signals found:", signals?.length);
            return;
        }
        const signal = signals[0];

        if (signalError || !signal) {
            console.error("Failed to fetch test signal:", signalError?.message);
            return;
        }

        // We can manually trigger the trade creation logic now since we have the signal
        // We can manually trigger the trade creation logic now since we have the signal
        // Map DB snake_case columns to Signal interface camelCase properties
        const signalForService = {
            ...signal,
            pair: signal.symbol,
            entry: signal.entry_price,
            entryType: signal.entry_type,
            stopLoss: signal.stop_loss,
            takeProfit: signal.take_profit,
            strategyId: signal.strategy_id,
            timestamp: signal.created_at
        };

        console.log("Mocking Engine: Calling createPaperTrade for signal...");
        await createPaperTrade(signalForService as unknown as any, userId);


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

        // 4. Test Idempotency - Trigger Execution Again manually
        // We can't easily trigger the engine event again without modifying code, 
        // but we can call the service directly to test the guard.
        // const { createPaperTrade } = await import('./services/paperTradingService');

        console.log("Testing Idempotency...");
        // Need user_id for creating trade manually. 
        // We can get it from the strategy object if we fetched it, but we only have ID now in some paths.
        // Let's fetch the strategy again to get user_id properly or reuse if available.
        // Reuse userId from above since we hardcoded it or fetched it

        const duplicateTradeId = await createPaperTrade(signal, userId);

        if (duplicateTradeId === trade?.id) {
            console.log("✅ Idempotency Passed: Returned existing trade ID.");
        } else {
            console.error("❌ Idempotency FAILED: Created duplicate or returned mismatch.");
        }

        // 5. Close Signal -> Should Close Trade
        console.log("Closing Signal...");
        await closeSignal(signal.id, 'MANUAL');

        // Manually trigger monitor or close logic since closeSignal updates DB but engine listens to events?
        // Wait, signalService.closeSignal just updates DB. 
        // The engine's `monitorOpenTrades` Loop checks for price exits.
        // BUT! Logic requirement 4: "On signal CLOSED -> Close the corresponding paper trade"
        // I missed adding the hook in `signalService.closeSignal` to call `paperTradingService.closePaperTrade`?
        // Let's re-read `signalService.ts`.
        // It updates DB. It DOES NOT call engine or service to close the trade.
        // The `monitorOpenTrades` in engine checks PRICE vs TP/SL. 
        // It does NOT seem to check if the *Signal* status changed to Closed from elsewhere (like manual close).

        // CORRECTION Needed: signalService.closeSignal needs to close the paper trade too!


    } catch (e) {
        console.error("Verification Error:", e);
    }
}

verifyPaperTrading();
