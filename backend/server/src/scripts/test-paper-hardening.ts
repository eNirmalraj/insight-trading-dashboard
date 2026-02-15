
import { supabaseAdmin } from '../services/supabaseAdmin';
import { reconcileActiveSignals } from '../services/signalQueue';
import { TradeExecutor } from '../services/tradeExecutor';

async function runVerification() {
    console.log('🧪 Starting Paper Trading Hardening Verification...');

    // 1. Setup Data
    console.log('1. Setting up test data...');
    // Find a user and strategy
    const { data: strategies } = await supabaseAdmin.from('strategies').select('id, user_id').limit(1);
    const strategy = strategies?.[0];

    if (!strategy) {
        console.error('❌ No strategy found to test with.');
        return;
    }
    console.log(`Using strategy ${strategy.id} (User: ${strategy.user_id})`);

    // Create a Dummy Signal (Active)
    const signalId = crypto.randomUUID();
    const { error: sigError } = await supabaseAdmin.from('signals').insert({
        id: signalId,
        strategy_id: strategy.id,
        symbol: 'BTCUSDT.P',
        direction: 'BUY',
        entry_type: 'Market',
        status: 'Active',
        strategy: 'Test Strategy',
        entry_price: 50000
    });

    if (sigError) {
        console.error('❌ Failed to create test signal:', sigError);
        return;
    }
    console.log(`Created test signal ${signalId}`);

    // 1.5 Ensure Balance
    const { data: acc } = await supabaseAdmin.from('paper_trading_accounts').select('*').eq('user_id', strategy.user_id).single();
    if (acc) {
        if (acc.balance < 5000) {
            console.log('Top up balance...');
            await supabaseAdmin.from('paper_trading_accounts').update({ balance: 10000 }).eq('id', acc.id);
        }
    } else {
        // Create one
        await supabaseAdmin.from('paper_trading_accounts').insert({
            user_id: strategy.user_id,
            name: 'Test Account',
            broker: 'Crypto',
            balance: 10000
        });
    }

    // 2. Test Atomic RPC Directly
    console.log('2. Testing open_paper_trade RPC...');
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('open_paper_trade', {
        p_user_id: strategy.user_id,
        p_signal_id: signalId,
        p_strategy_id: strategy.id,
        p_symbol: 'BTCUSDT.P',
        p_direction: 'BUY',
        p_entry_price: 50000,
        p_initial_balance: 10000
    });

    if (rpcError || !rpcResult.success) {
        console.error('❌ RPC Failed:', rpcError || rpcResult);
    } else {
        console.log('✅ RPC Success:', rpcResult);
    }

    // 3. Test Idempotency (Call RPC again)
    console.log('3. Testing Idempotency (RPC again)...');
    const { data: rpcResult2, error: rpcError2 } = await supabaseAdmin.rpc('open_paper_trade', {
        p_user_id: strategy.user_id,
        p_signal_id: signalId,
        p_strategy_id: strategy.id,
        p_symbol: 'BTCUSDT.P',
        p_direction: 'BUY',
        p_entry_price: 50000
    });

    if (rpcError2) {
        console.error('❌ Idempotency RPC Error:', rpcError2);
    } else if (!rpcResult2.success && rpcResult2.error === 'Trade already exists') {
        console.log('✅ Idempotency Verified (Trade already exists)');
    } else {
        console.log('❌ Idempotency Failed (Unexpected result):', rpcResult2);
    }

    // 4. Test Reconciliation Logic
    console.log('4. Testing Reconciliation Logic...');
    // Create another signal
    const signalId2 = crypto.randomUUID();
    await supabaseAdmin.from('signals').insert({
        id: signalId2,
        strategy_id: strategy.id,
        symbol: 'ETHUSDT.P',
        direction: 'SELL',
        entry_type: 'Market',
        status: 'Active',
        strategy: 'Test Strategy',
        entry_price: 3000
    });
    console.log(`Created 2nd test signal ${signalId2} (Active, No Trade)`);

    // Run Reconciliation
    await reconcileActiveSignals();

    // Check if trade exists
    const { data: trade2 } = await supabaseAdmin.from('paper_trades').select('*').eq('signal_id', signalId2).single();
    if (trade2) {
        console.log('✅ Reconciliation Verified (Trade created for missing signal)');
    } else {
        console.error('❌ Reconciliation Failed (No trade created)');
    }

    // 5. Cleanup
    console.log('5. Cleanup...');
    await supabaseAdmin.from('paper_trades').delete().in('signal_id', [signalId, signalId2]);
    await supabaseAdmin.from('signals').delete().in('id', [signalId, signalId2]);
    console.log('✅ Cleanup Complete.');
}

runVerification();
