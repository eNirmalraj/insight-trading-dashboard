
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verifyE2E() {
    console.log("=== STARTING E2E PAPER TRADING VERIFICATION (REAL DATA) ===");

    try {
        const { supabase } = await import('./src/services/supabaseClient.ts');
        const { PaperExecutionEngine } = await import('./src/engine/paperExecutionEngine.ts');
        const { SignalStatus, TradeDirection } = await import('./src/types.ts');

        if (!supabase) {
            console.error("❌ Supabase client is null.");
            return;
        }

        // REAL DATA from DB context
        const userId = 'c8087a42-2417-425f-87b4-d44bbc7402f8';
        const targetStrategyName = 'SMA Trend Strategy';
        const targetSymbol = 'BTCUSDT';

        // 1. Get Strategy ID
        const { data: strat } = await supabase.from('strategies').select('id').eq('name', targetStrategyName).single();
        let strategyId: string;
        if (!strat) {
            console.error(`❌ Strategy "${targetStrategyName}" not found via client. Trying manual ID query fallback...`);
            // Use the ID we found via MCP tool if client fails due to RLS
            const manualId = '11111111-1111-1111-1111-111111111111'; // As found in previous step
            console.log(`Using fallback Strategy ID: ${manualId}`);
            strategyId = manualId;
        } else {
            console.log(`Confirmed Strategy ID: ${strat.id}`);
            strategyId = strat.id;
        }

        // 2. Mock a realistic Signal (Using UUID for DB compatibility)
        const testSignal = {
            id: 'c8087a42-2417-425f-87b4-d44bbc740000', // Mock UUID
            strategyId: '11111111-1111-1111-1111-111111111111', // Real SMA Trend ID
            pair: targetSymbol,
            strategy: targetStrategyName,
            direction: TradeDirection.BUY,
            entry: 50000,
            entryType: 'Market',
            stopLoss: 49500, // 1% distance
            takeProfit: 55000,
            status: SignalStatus.ACTIVE,
            timestamp: new Date().toISOString(),
            timeframe: '1H',
            indicator_values: {}
        };

        // 3. Process Signal (Force use the correct strategyId)
        console.log(`Processing test signal for ${testSignal.pair} (SignalID: ${testSignal.id})...`);
        await PaperExecutionEngine.processSignal(testSignal as any);

        // 4. Verify Trade Creation
        console.log("Waiting for DB to update...");
        await new Promise(r => setTimeout(r, 3000));

        const { data: trades, error: tradeError } = await supabase
            .from('paper_trades')
            .select('*')
            .eq('signal_id', testSignal.id);

        if (tradeError) {
            console.error("❌ Error fetching trades:", tradeError.message);
            return;
        }

        if (trades && trades.length > 0) {
            const trade = trades[0];
            console.log("✅✅✅ SUCCESS: E2E Trade created!");
            console.log(`Trade ID: ${trade.id}`);
            console.log(`Symbol: ${trade.symbol}`);
            console.log(`Quantity: ${trade.quantity}`);
            console.log(`Leverage: ${trade.leverage}x`);
            console.log(`P/L: ${trade.pnl || 0}`);
        } else {
            console.error("❌ FAIL: No trade created in DB.");
            console.log("Possible reasons:");
            console.log("1. Account Balance too low (we checked, it was $10k).");
            console.log("2. Risk Engine rejection (SL distance, fees, etc).");
            console.log("3. Auto-Trade turned OFF for this symbol/watchlist in DB.");
        }

    } catch (err) {
        console.error("❌ UNEXPECTED ERROR:", err);
    }
}

verifyE2E();
