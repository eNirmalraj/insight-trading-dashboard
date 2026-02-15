
import { supabaseAdmin } from '../services/supabaseAdmin';

async function runVerification() {
    console.log('🧪 Starting Paper Trading CLOSE Verification...');

    // 1. Setup Data
    console.log('1. Setting up test trade...');
    const { data: strategies } = await supabaseAdmin.from('strategies').select('id, user_id').limit(1);
    const strategy = strategies?.[0];

    if (!strategy) {
        console.error('❌ No strategy found.');
        return;
    }

    // Ensure Balance
    const { data: acc } = await supabaseAdmin.from('paper_trading_accounts').select('*').eq('user_id', strategy.user_id).single();
    let initialBalance = 10000;
    if (!acc) {
        await supabaseAdmin.from('paper_trading_accounts').insert({
            user_id: strategy.user_id,
            name: 'Test Account',
            broker: 'Crypto',
            balance: initialBalance
        });
    } else {
        initialBalance = 10000;
        await supabaseAdmin.from('paper_trading_accounts').update({ balance: initialBalance }).eq('id', acc.id);
    }

    // Create Signal
    const signalId = crypto.randomUUID();
    await supabaseAdmin.from('signals').insert({
        id: signalId,
        strategy_id: strategy.id,
        symbol: 'SOLUSDT.P',
        direction: 'BUY',
        entry_type: 'Market',
        status: 'Active',
        strategy: 'Test Strategy',
        entry_price: 100
    });

    // Open Trade (Using RPC)
    const { data: openResult } = await supabaseAdmin.rpc('open_paper_trade', {
        p_user_id: strategy.user_id,
        p_signal_id: signalId,
        p_strategy_id: strategy.id,
        p_symbol: 'SOLUSDT.P',
        p_direction: 'BUY',
        p_entry_price: 100,
        p_initial_balance: 10000
    });

    if (!openResult.success) {
        console.error('❌ Setup failed (Open Trade):', openResult);
        return;
    }
    console.log(`✅ Trade Opened. Balance: ${openResult.new_balance} (Should be 9000 if cost is 1000)`);

    // 2. Test Atomic Close RPC
    console.log('2. Testing close_paper_trade RPC (+10% PnL)...');

    // PnL % = 10. Cost = 1000. PnL Amount = 100.
    // Exp New Balance = 9000 + 1000 + 100 = 10100.
    const { data: closeResult, error: closeError } = await supabaseAdmin.rpc('close_paper_trade', {
        p_signal_id: signalId,
        p_pnl_percent: 10,
        p_close_reason: 'TP'
    });

    if (closeError || !closeResult.success) {
        console.error('❌ RPC Close Failed:', closeError || closeResult);
    } else {
        console.log(`✅ RPC Close Success. New Balance: ${closeResult.new_balance}`);
        if (Number(closeResult.new_balance) === 10100) {
            console.log('✅ Balance Calculation Correct');
        } else {
            console.error(`❌ Balance Mismatch. Expected 10100, got ${closeResult.new_balance}`);
        }
    }

    // 3. Test Idempotency
    console.log('3. Testing Idempotency (Close again)...');
    const { data: closeResult2 } = await supabaseAdmin.rpc('close_paper_trade', {
        p_signal_id: signalId,
        p_pnl_percent: 10,
        p_close_reason: 'TP'
    });

    if (!closeResult2.success && closeResult2.error === 'Trade already closed') {
        console.log('✅ Idempotency Verified (Trade already closed)');
    } else {
        console.error('❌ Idempotency Failed:', closeResult2);
    }

    // 4. Cleanup
    console.log('4. Cleanup...');
    await supabaseAdmin.from('paper_trades').delete().eq('signal_id', signalId);
    await supabaseAdmin.from('signals').delete().eq('id', signalId);
    console.log('✅ Cleanup Complete.');
}

runVerification();
