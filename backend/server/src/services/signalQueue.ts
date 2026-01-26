import { supabaseAdmin } from './supabaseAdmin';
import { TradeExecutor } from './tradeExecutor';

export const startSignalListener = () => {
    console.log('[SIGNAL QUEUE] Listening for new signals in database...');

    const channel = supabaseAdmin
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'signal_logs', // Assuming we have a table for signals to process
            },
            async (payload) => {
                console.log('[SIGNAL RECEIVED]', payload.new);
                await processSignal(payload.new);
            }
        )
        .subscribe();
};

async function processSignal(signal: any) {
    // 1. Validate Signal
    if (!signal.symbol || !signal.action || !signal.strategy_id) {
        console.warn('[SIGNAL SKIPPED] Invalid payload', signal);
        return;
    }

    // 2. Find Subscribers (Mock Logic for now)
    // In real app: Query 'social_follows' or 'strategy_subscriptions'
    console.log(`[PROCESSING] Finding subscribers for Strategy ${signal.strategy_id}...`);

    // Mock User for Testing
    const mockUser = {
        id: 'user-123',
        exchangeId: 'binance',
        apiKey: 'mock-key',
        apiSecret: 'mock-secret',
        riskSize: 0.01 // 1% of balance
    };

    // 3. Execute Trade for User
    try {
        await TradeExecutor.executeTrade({
            exchangeId: mockUser.exchangeId,
            apiKey: mockUser.apiKey,
            apiSecret: mockUser.apiSecret,
            symbol: signal.symbol, // e.g. "BTC/USDT"
            side: signal.action.toLowerCase(), // "buy" or "sell"
            amount: 0.001, // Mock amount
            type: 'market'
        });

        // 4. Log Success
        console.log('[SIGNAL PROCESSED] Trade executed successfully.');

    } catch (error) {
        console.error('[SIGNAL ERROR] Failed to execute trade:', error);
    }
}
