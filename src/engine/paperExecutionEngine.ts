import { supabase } from '../services/supabaseClient';
import { Signal, SignalStatus } from '../types';

export class PaperExecutionEngine {

    /**
     * processSignal
     * 
     * Evaluates a signal (specifically when it becomes ACTIVE) for paper execution.
     * checks if Auto-Trade is enabled for the specific script/symbol.
     * If enabled, opens a paper position.
     */
    public static async processSignal(signal: Signal) {
        if (signal.status !== SignalStatus.ACTIVE) return;

        // 1. Check Auto-Trade Eligibility
        const isEligible = await this.checkAutoTradeEligibility(signal);
        if (!isEligible) {
            console.log(`[PaperExecution] Signal ${signal.id} (${signal.pair}) skipped. Auto-Trade disabled.`);
            return;
        }

        // 2. Open Position
        await this.openPosition(signal);
    }

    private static async checkAutoTradeEligibility(signal: Signal): Promise<boolean> {
        // Find the watchlist item configuration for this symbol and proper strategy
        // We need to join watchlists and watchlist_items to see if auto_trade is enabled.
        // This is slightly complex because signals are linked to strategies, and watchlists link to strategies.

        // 1. Get strategies matching the signal's strategy_id
        const { data: strategies } = await supabase
            .from('strategies')
            .select('name, id')
            .eq('id', signal.strategyId)
            .single();

        if (!strategies) return false;

        // 2. Find scripts (watchlists) that use this strategy
        // AND have the item enabled or master enabled.
        // Actually, the phase C1 requirement was item-level gating. 
        // We check if ANY script has this symbol enabled for this strategy.

        // Query logic:
        // Find watchlist_items for this symbol
        // WHERE watchlist.strategy_type = strategies.name
        // AND (watchlist_item.is_auto_trade_enabled = true) -- Master switch logic omitted for Phase C1 simplicity as requested

        // Since we don't have direct access to complex joins easily via JS client without RPC, 
        // we'll fetch candidate items.
        // Note: In a real high-throughput engine, this should be a single efficient SQL query or cached.

        // Fetch watchlist items for this symbol
        // We need to know which watchlist they belong to.

        // Optimization: Use `watchlists` table `strategy_type` column.

        const { data: watchlists } = await supabase
            .from('watchlists')
            .select(`
                id,
                name,
                strategy_type,
                items: watchlist_items (
                    id,
                    symbol,
                    auto_trade_enabled
                )
            `)
            .eq('strategy_type', strategies.name); // Using name as link per current architecture

        if (!watchlists) return false;

        // Check if ANY of the watchlists have this symbol enabled
        const hasEnabledItem = watchlists.some(wl =>
            wl.items.some((item: any) =>
                item.symbol === signal.pair &&
                item.auto_trade_enabled === true
            )
        );

        return hasEnabledItem;
    }

    private static async openPosition(signal: Signal) {
        try {
            const entryPrice = signal.entry;
            const quantity = 1; // Default quantity for paper trading simplicity

            const tradeData: any = {
                // user_id will be fetched from strategy
                signal_id: signal.id,
                strategy_id: signal.strategyId,
                symbol: signal.pair,
                direction: signal.direction,
                entry_price: entryPrice,
                quantity: quantity,
                status: 'OPEN',
                filled_at: new Date().toISOString()
            };

            // We need to fetch the user_id from the strategy if not on signal
            if (signal.strategyId) {
                const { data: strategy } = await supabase
                    .from('strategies')
                    .select('user_id')
                    .eq('id', signal.strategyId)
                    .single();

                if (strategy) {
                    tradeData.user_id = strategy.user_id;
                } else {
                    console.error("Could not find owner for strategy", signal.strategyId);
                    return;
                }
            } else {
                console.error("Signal missing strategyId", signal);
                return;
            }

            const { error } = await supabase
                .from('paper_trades')
                .insert(tradeData);

            if (error) {
                console.error("[PaperExecution] Failed to open position:", error);
            } else {
                console.log(`[PaperExecution] OPEN ${signal.direction} ${signal.pair} @ ${entryPrice}`);
            }

        } catch (err) {
            console.error("[PaperExecution] Error opening position:", err);
        }
    }

    /**
     * monitorOpenTrades
     * 
     * To be called periodically (e.g. by the cron/workerLoop).
     * Checks current price vs TP/SL for all OPEN trades.
     */
    public static async monitorOpenTrades() {
        // Fetch all OPEN trades
        const { data: openTrades, error } = await supabase
            .from('paper_trades')
            .select(`
                *,
                signal: signals (
                    take_profit,
                    stop_loss
                )
            `)
            .eq('status', 'OPEN');

        if (error || !openTrades) return;

        for (const trade of openTrades) {
            await this.checkTradeExit(trade);
        }
    }

    private static async checkTradeExit(trade: any) {
        // Fetch current price for symbol
        // Using our market data cache or service
        const currentPrice = await this.fetchCurrentPrice(trade.symbol); // Helper needed
        if (!currentPrice) return;

        let closeReason = null;
        let pnl = 0;
        let pnlPercent = 0;

        const tp = trade.signal?.take_profit;
        const sl = trade.signal?.stop_loss;

        // Logic for BUY
        if (trade.direction === 'BUY') {
            if (tp && currentPrice >= tp) closeReason = 'TP';
            else if (sl && currentPrice <= sl) closeReason = 'SL';
        }
        // Logic for SELL
        else if (trade.direction === 'SELL') {
            if (tp && currentPrice <= tp) closeReason = 'TP';
            else if (sl && currentPrice >= sl) closeReason = 'SL';
        }

        if (closeReason) {
            // Calculate PnL
            if (trade.direction === 'BUY') {
                pnl = (currentPrice - trade.entry_price) * trade.quantity;
                pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
            } else {
                pnl = (trade.entry_price - currentPrice) * trade.quantity;
                pnlPercent = ((trade.entry_price - currentPrice) / trade.entry_price) * 100;
            }

            await this.closePosition(trade.id, currentPrice, pnl, pnlPercent, closeReason);
        }
    }

    private static async closePosition(tradeId: string, exitPrice: number, pnl: number, pnlPercent: number, reason: string) {
        const { error } = await supabase
            .from('paper_trades')
            .update({
                status: 'CLOSED',
                exit_price: exitPrice,
                pnl: pnl,
                pnl_percent: pnlPercent,
                exit_reason: reason,
                closed_at: new Date().toISOString()
            })
            .eq('id', tradeId);

        if (!error) {
            console.log(`[PaperExecution] CLOSED trade ${tradeId}. Reason: ${reason}, PnL: ${pnl}`);
        }
    }

    // Mock price fetcher for Phase C2 simplicity
    // in real engine this comes from marketDataCache
    private static async fetchCurrentPrice(symbol: string): Promise<number | null> {
        const { data } = await supabase
            .from('market_data_cache')
            .select('price')
            .eq('symbol', symbol)
            .single();
        return data?.price || null;
    }
}
