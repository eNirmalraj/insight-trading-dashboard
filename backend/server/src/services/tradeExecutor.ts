import { supabaseAdmin } from './supabaseAdmin';

interface SignalData {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss?: number;
    take_profit?: number;
    profit_loss?: number; // from signals table
    close_reason?: string;
}

export class TradeExecutor {
    /**
     * Opens a new paper trade position
     */
    /**
     * Opens a new paper trade position
     */
    static async openPosition(userId: string, signal: SignalData) {
        console.log(`[TradeExecutor] Opening Position: ${signal.symbol} ${signal.direction}`);

        try {
            // Call Atomic RPC
            const { data, error } = await supabaseAdmin.rpc('open_paper_trade', {
                p_user_id: userId,
                p_signal_id: signal.id,
                p_strategy_id: (signal as any).strategy_id, // Ensure signal has strategy_id or handle it
                p_symbol: signal.symbol,
                p_direction: signal.direction,
                p_entry_price: signal.entry_price,
                p_initial_balance: 10000,
            });

            if (error) {
                console.error('[TradeExecutor] RPC Call Failed:', error);
                throw error;
            }

            // Handle Logic Response
            if (!data.success) {
                if (data.error === 'Trade already exists') {
                    console.warn(
                        `[TradeExecutor] ⚠️ Trade already exists for signal ${signal.id}. Skipping.`
                    );
                    return; // Idempotent success
                }
                console.warn(`[TradeExecutor] ❌ Could not open position: ${data.error}`);
            } else {
                console.log(
                    `[TradeExecutor] ✅ Position Opened: ${signal.symbol}. New Balance: ${data.new_balance}`
                );
            }
        } catch (error) {
            console.error('[TradeExecutor] Open Position Failed:', error);
        }
    }

    /**
     * Closes an existing paper trade position
     */
    /**
     * Closes an existing paper trade position
     */
    static async closePosition(userId: string, signal: SignalData) {
        console.log(`[TradeExecutor] Closing Position: ${signal.symbol}`);

        try {
            // Call Atomic RPC
            const { data, error } = await supabaseAdmin.rpc('close_paper_trade', {
                p_signal_id: signal.id,
                p_pnl_percent: signal.profit_loss || 0,
                p_close_reason: signal.close_reason || 'MANUAL',
            });

            if (error) {
                console.error('[TradeExecutor] RPC Close Failed:', error);
                throw error;
            }

            // Handle Logic Response
            if (!data.success) {
                if (data.error === 'Trade already closed') {
                    console.warn(
                        `[TradeExecutor] ⚠️ Trade already closed for signal ${signal.id}. Skipping.`
                    );
                    return; // Idempotent
                }
                console.warn(`[TradeExecutor] ❌ Could not close position: ${data.error}`);
            } else {
                console.log(
                    `[TradeExecutor] ✅ Position Closed: ${signal.symbol}. PnL: $${data.pnl} (${signal.profit_loss}%). New Balance: ${data.new_balance}`
                );
            }
        } catch (error) {
            console.error('[TradeExecutor] Close Position Failed:', error);
        }
    }
}
