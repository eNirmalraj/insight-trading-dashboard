import { supabaseAdmin } from './supabaseAdmin';
import { TradeExecutor } from './tradeExecutor';

export const startSignalListener = async () => {

    // 1. Reconcile missed signals (Restart Catch-up) - NON-BLOCKING
    reconcileActiveSignals().catch(e => console.error('[SIGNAL QUEUE] Reconciliation Error:', e));

    console.log('[SIGNAL QUEUE] Listening for new signals in database...');

    const channel = supabaseAdmin
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: '*', // Listen to INSERT and UPDATE
                schema: 'public',
                table: 'signals',
            },
            async (payload) => {
                const newSignal = payload.new as any;
                console.log('[SIGNAL EVENT]', payload.eventType, newSignal.symbol, newSignal.status);
                await processSignalEvent(payload);
            }
        )
        .subscribe();
};

/**
 * Scans for 'Active' signals that don't have an open trade (e.g. after server restart)
 * Process in batches to avoid rate limits and blocking.
 */
export async function reconcileActiveSignals() {
    console.log('[SIGNAL QUEUE] 🔄 Reconciling active signals (Background)...');
    try {
        const { data: activeSignals, error } = await supabaseAdmin
            .from('signals')
            .select('*')
            .eq('status', 'Active');

        if (error || !activeSignals) {
            console.error('[SIGNAL QUEUE] Failed to fetch active signals', error);
            return;
        }

        console.log(`[SIGNAL QUEUE] Found ${activeSignals.length} active signals. Processing in batches...`);

        const BATCH_SIZE = 20;
        for (let i = 0; i < activeSignals.length; i += BATCH_SIZE) {
            const batch = activeSignals.slice(i, i + BATCH_SIZE);
            // console.log(`[SIGNAL QUEUE] Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(activeSignals.length / BATCH_SIZE)}...`);

            await Promise.all(batch.map(async (signal) => {
                try {
                    // We can just try to open it. The RPC is idempotent!
                    // But we need the userId.
                    const { data: strategy } = await supabaseAdmin
                        .from('strategies')
                        .select('user_id')
                        .eq('id', signal.strategy_id)
                        .single();

                    if (strategy?.user_id) {
                        await TradeExecutor.openPosition(strategy.user_id, signal);
                    }
                } catch (err) {
                    console.error(`[SIGNAL QUEUE] Failed to reconcile signal ${signal.id}`, err);
                }
            }));

            // Small delay between batches to be nice to the DB/API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('[SIGNAL QUEUE] ✅ Reconciliation Complete.');

    } catch (e) {
        console.error('[SIGNAL QUEUE] Reconciliation failed:', e);
    }
}

async function processSignalEvent(payload: any) {
    const signal = payload.new;
    if (!signal || !signal.strategy_id) return;

    // 1. Fetch User ID from Strategy
    const { data: strategy, error } = await supabaseAdmin
        .from('strategies')
        .select('user_id')
        .eq('id', signal.strategy_id)
        .single();

    if (error || !strategy) {
        console.warn(`[SIGNAL SKIP] Could not find strategy/user for signal ${signal.id}`);
        return;
    }

    const userId = strategy.user_id;

    // 2. Handle Event Type
    try {
        if (payload.eventType === 'INSERT' && signal.status === 'Active') {
            // New Active Signal -> Open Position
            console.log(`[TRADE ENTRY] Handling Entry for ${signal.symbol}`);
            await TradeExecutor.openPosition(userId, signal);

        } else if (payload.eventType === 'UPDATE') {
            // Status changed to Active -> Open Position (if Late Entry)
            if (signal.status === 'Active' && payload.old.status === 'Pending') {
                console.log(`[TRADE ENTRY] Handling Entry (Activated) for ${signal.symbol}`);
                await TradeExecutor.openPosition(userId, signal);
            }
            // Status changed to Closed -> Close Position
            else if (signal.status === 'Closed' && payload.old.status !== 'Closed') {
                console.log(`[TRADE EXIT] Handling Exit for ${signal.symbol}`);
                await TradeExecutor.closePosition(userId, signal);
            }
        }
    } catch (err) {
        console.error(`[TRADE ERROR] Failed to process signal ${signal.id}:`, err);
    }
}
