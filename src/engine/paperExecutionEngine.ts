import { supabase } from '../services/supabaseClient';
import { Signal, SignalStatus } from '../types';
import { createPaperTrade, closePaperTrade } from '../services/paperTradingService';
import { SymbolUtils } from '../utils/symbolUtils';
import { RiskCalculator } from './RiskCalculator';

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

        // 1. Get Eligible Watchlists
        const eligibilities = await this.checkAutoTradeEligibility(signal);
        if (!eligibilities || eligibilities.length === 0) {
            console.log(`[PaperExecution] Signal ${signal.id} (${signal.pair}) skipped. No eligible auto-trade watchlists found.`);
            return;
        }

        // 2. Open Positions for all eligible watchlists
        for (const eligibility of eligibilities) {
            console.log(`[PaperExecution] 🚀 Opening position for user ${eligibility.userId} on watchlist ${eligibility.watchlistName}`);
            await this.openPosition(signal, eligibility.riskSettings, eligibility.userId);
        }
    }

    private static async checkAutoTradeEligibility(signal: Signal): Promise<{ userId: string; watchlistName: string; riskSettings: any }[] | null> {
        // Use strategy name directly from signal to find matching watchlists (more resilient to RLS on strategies table)
        const targetStrategyName = signal.strategy;

        if (!targetStrategyName) {
            console.log(`[PaperExecution] Signal missing strategy name. Cannot check eligibility.`);
            return null;
        }

        console.log(`[PaperExecution] Searching for watchlists matching strategy: ${targetStrategyName}...`);

        // 2. Find ALL scripts (watchlists) that use this strategy
        const { data: watchlists, error: wlError } = await supabase
            .from('watchlists')
            .select(`
                id,
                user_id,
                name,
                strategy_type,
                trading_mode,
                account_type,
                execution_timeframes,
                manual_risk_enabled,
                market_type,
                risk_method,
                auto_leverage_enabled,
                lot_size,
                risk_percent,
                leverage,
                stop_loss_distance,
                take_profit_distance,
                trailing_stop_loss_distance,
                items: watchlist_items (
                    id,
                    symbol,
                    auto_trade_enabled
                )
            `)
            .eq('strategy_type', targetStrategyName)
            .eq('trading_mode', 'paper');

        if (wlError) {
            console.error(`[PaperExecution] Error fetching watchlists:`, wlError.message);
            return null;
        }

        if (!watchlists || watchlists.length === 0) {
            console.log(`[PaperExecution] No watchlists found matching strategy '${targetStrategyName}' and mode 'paper'`);
            return null;
        }

        console.log(`[PaperExecution] Found ${watchlists.length} potential watchlists. Checking symbol items...`);

        const results: { userId: string; watchlistName: string; riskSettings: any }[] = [];

        for (const wl of watchlists) {
            const enabledItems = wl.items.filter((i: any) => i.auto_trade_enabled);
            console.log(`[PaperExecution] Checking watchlist '${wl.name}'. Items: ${wl.items.length}, Enabled: ${enabledItems.length}`);

            // Check if symbol is enabled in this watchlist
            const isItemEnabled = wl.items.some((item: any) =>
                item.symbol === signal.pair &&
                item.auto_trade_enabled === true
            );

            if (!isItemEnabled) continue;

            // Check Execution Timeframes
            if (wl.execution_timeframes && Array.isArray(wl.execution_timeframes) && wl.execution_timeframes.length > 0) {
                if (!wl.execution_timeframes.includes(signal.timeframe)) {
                    console.log(`[PaperExecution] Watchlist '${wl.name}' timeframe mismatch. Skip.`);
                    continue;
                }
            }

            results.push({
                userId: wl.user_id,
                watchlistName: wl.name,
                riskSettings: {
                    manualRiskEnabled: wl.manual_risk_enabled,
                    marketType: wl.market_type,
                    riskMethod: wl.risk_method,
                    autoLeverageEnabled: wl.auto_leverage_enabled,
                    accountType: wl.account_type || (wl.market_type ? 'crypto' : 'forex'),
                    lotSize: wl.lot_size,
                    riskPercent: wl.risk_percent,
                    leverage: wl.leverage,
                    stopLossDistance: wl.stop_loss_distance,
                    takeProfitDistance: wl.take_profit_distance,
                    trailingStopLossDistance: wl.trailing_stop_loss_distance
                }
            });
        }

        return results;
    }

    /**
     * Checks if the signal's timeframe is allowed by the watchlist configuration.
     * Use simple array inclusion check in the main logic instead of a separate helper method
     * since it's just a one-liner now.
     */

    private static async openPosition(signal: Signal, riskSettings: any, userId: string) {
        try {
            let overrides: any = undefined;

            // Calculate Overrides first to determine SL distance for sizing
            const entry = signal.entry;
            const isBuy = signal.direction === 'BUY';
            let slDistance = signal.stopLoss ? Math.abs(entry - signal.stopLoss) : 0;
            let finalSl = signal.stopLoss;

            if (riskSettings?.manualRiskEnabled) {
                // Calculate Override Levels
                const distSl = riskSettings.stopLossDistance;
                const distTp = riskSettings.takeProfitDistance;
                const distTsl = riskSettings.trailingStopLossDistance;

                overrides = {
                    stopLoss: distSl > 0 ? (isBuy ? entry - distSl : entry + distSl) : signal.stopLoss,
                    takeProfit: distTp > 0 ? (isBuy ? entry + distTp : entry - distTp) : signal.takeProfit,
                    trailingStopLoss: distTsl > 0 ? distTsl : signal.trailingStopLoss
                };

                if (overrides.stopLoss) {
                    slDistance = Math.abs(entry - overrides.stopLoss);
                    finalSl = overrides.stopLoss;
                }

                console.log(`[PaperExecution] Applying Manual Risk Override for ${signal.pair}. SL: ${overrides.stopLoss}`);
            }

            // --- QUANTITY & LEVERAGE CALCULATION ---
            let quantity = 1; // Default
            let finalLeverage = riskSettings?.leverage || 1;

            // Check Account Type (Crypto vs Forex) logic
            const isCrypto = riskSettings?.accountType?.toLowerCase() === 'crypto' || riskSettings?.marketType;

            // Detect Futures based on Symbol Suffix (.P) OR Risk Settings
            const isSymbolFutures = signal.pair.endsWith('.P');
            const marketType = riskSettings?.marketType || (isSymbolFutures ? 'futures' : 'spot');

            if (isCrypto) {
                const isSpot = marketType === 'spot';
                const isFutures = marketType === 'futures';
                const riskMethod = riskSettings?.riskMethod || 'fixed';

                if (isSpot) {
                    finalLeverage = 1;
                }

                // --- EXCHANGE-GRADE RISK & SAFETY CHECKS (Common) ---
                if (overrides?.stopLoss) {
                    // 1. Min Stop Loss Validation
                    const slValidation = RiskCalculator.isStopLossValid(entry, overrides.stopLoss);
                    if (!slValidation.isValid) {
                        console.error(`[PaperExecution] Trade Rejected: ${slValidation.reason}`);
                        return;
                    }

                    // 2. Liquidation Safety (Futures Only)
                    if (isFutures) {
                        const direction = (signal.direction.toLowerCase() === 'buy' || signal.direction.toLowerCase() === 'long') ? 'buy' : 'sell';
                        const liqSafety = RiskCalculator.checkLiquidationSafety(entry, overrides.stopLoss, finalLeverage, direction);
                        if (!liqSafety.isSafe) {
                            console.error(`[PaperExecution] Trade Rejected: ${liqSafety.reason} (Liq: ${liqSafety.liquidationPrice.toFixed(2)})`);
                            return;
                        }
                    }
                }

                // distinct logic for method
                if (riskMethod === 'fixed') {
                    // Fixed Amount (USDT) -> Margin/Value
                    const amount = riskSettings?.lotSize || 100; // Default 100 USDT
                    // If Spot, Qty = Amount / Entry
                    // If Futures, Position Size = Amount * Leverage. Qty = Position Size / Entry

                    const positionSize = amount * finalLeverage;
                    quantity = positionSize / entry;
                }
                else if (riskMethod === 'percent') {
                    // Need Balance
                    try {
                        const { data: accounts } = await supabase
                            .from('paper_trading_accounts')
                            .select('balance, broker, sub_type')
                            .eq('user_id', userId);

                        // Find specific wallet matching the market type
                        // Use calculated marketType (based on symbol suffix if needed)
                        const cryptoAccount = accounts?.find((a: any) =>
                            (a.broker === 'Crypto' || a.broker === 'Binance') &&
                            (a.sub_type === marketType)
                        );

                        // SANITY CHECK: Fail if no account or balance <= 0
                        if (!cryptoAccount) {
                            console.error(`[PaperExecution] No Crypto/Binance account found for user ${userId}. Skipping.`);
                            return;
                        }
                        const balance = cryptoAccount.balance;
                        if (balance <= 0) {
                            console.warn(`[PaperExecution] Insufficient balance (${balance}). Skipping.`);
                            return;
                        }

                        // --- PORTFOLIO RISK MANAGEMENT ---
                        // Fetch open positions to calculate Total Open Risk & Used Margin
                        const { data: openPositions, error: posError } = await supabase
                            .from('paper_trades')
                            .select('entry_price, quantity, stop_loss, direction, status')
                            .eq('user_id', userId)
                            .eq('status', 'OPEN');

                        if (!posError && openPositions) {
                            let totalOpenRisk = 0;
                            openPositions.forEach((pos: any) => {
                                const pSl = pos.stop_loss || pos.entry_price; // Fallback
                                const pRisk = pos.quantity * Math.abs(pos.entry_price - pSl);
                                totalOpenRisk += pRisk;
                            });

                            // PROPOSED CAP: Max 5% of Balance Total Open Risk
                            const MAX_TOTAL_RISK_PERC = 5;
                            const maxRiskAmt = balance * (MAX_TOTAL_RISK_PERC / 100);

                            // Estimate new risk
                            const newRisk = balance * ((riskSettings?.riskPercent || 1) / 100);

                            if (totalOpenRisk + newRisk > maxRiskAmt) {
                                console.warn(`[PaperExecution] Portfolio Risk Cap Exceeded! Open: $${totalOpenRisk.toFixed(2)}, New: $${newRisk.toFixed(2)}, Limit: $${maxRiskAmt.toFixed(2)}. Skipping.`);
                                return;
                            }
                        }

                        // SANITY CHECK: Cap Risk %
                        const riskPerc = riskSettings?.riskPercent || 1;
                        if (riskPerc > 100 || riskPerc <= 0) {
                            console.warn(`[PaperExecution] Invalid Risk Percent (${riskPerc}). Skipping.`);
                            return;
                        }

                        const riskAmount = balance * (riskPerc / 100);

                        // Sizing based on SL distance
                        if (slDistance > 0) {
                            quantity = riskAmount / slDistance;
                        } else {
                            console.error(`[PaperExecution] CRITICAL: SL Distance is 0. Cannot calculate quantity from Risk %. Skipping.`);
                            return; // HARD FAIL for safety
                        }

                        // Auto Leverage Logic (Futures Only)
                        if (isFutures && riskSettings?.autoLeverageEnabled) {
                            const positionValue = quantity * entry;
                            // Required Margin should be <= Balance (or reasonable utilization)
                            // Let's say we allow using up to 95% of balance for a trade? 
                            // Or simpler: Min Leverage = PositionValue / Balance.
                            // Example: Pos $5000, Bal $1000. Lev must be >= 5.
                            const minLeverage = positionValue / balance;
                            finalLeverage = Math.ceil(minLeverage);
                            if (finalLeverage < 1) finalLeverage = 1;
                            if (finalLeverage > 125) finalLeverage = 125;
                            console.log(`[PaperExecution] Auto-Leverage calculated: ${finalLeverage}x (Pos: ${positionValue.toFixed(2)}, Bal: ${balance})`);
                        }

                        // --- 3. FEE-AWARE POSITION SIZING (Risk % Mode) ---
                        if (slDistance > 0 && overrides?.stopLoss) {
                            // Recalculate Qty using Fee-Aware Logic (adjusts for fees)
                            quantity = RiskCalculator.calculateFeeAwareQty(riskAmount, entry, overrides.stopLoss);
                            console.log(`[PaperExecution] Fee-Aware Sizing applied. Qty adjusted for fees.`);
                        }

                    } catch (err) {
                        console.error("Error fetching balance for risk sizing:", err);
                    }
                }
            } else {
                // Forex / Default logic
                quantity = riskSettings?.lotSize || 0.01;
            }




            // --- PRECISION & SAFETY CHECKS (Existing) ---
            const precision = SymbolUtils.getPrecision(signal.pair);

            // 1. Round Quantity

            quantity = SymbolUtils.applyStepSize(quantity, precision.stepSize);

            // 2. Round Price Levels (SL/TP)
            if (overrides) {
                if (overrides.stopLoss) overrides.stopLoss = SymbolUtils.applyTickSize(overrides.stopLoss, precision.tickSize);
                if (overrides.takeProfit) overrides.takeProfit = SymbolUtils.applyTickSize(overrides.takeProfit, precision.tickSize);
                if (overrides.trailingStopLoss) overrides.trailingStopLoss = SymbolUtils.applyTickSize(overrides.trailingStopLoss, precision.tickSize);
            }

            // 3. Min Qty Check
            if (quantity < precision.minQty) {
                console.warn(`[PaperExecution] Quantity ${quantity} below MinQty ${precision.minQty} for ${signal.pair}. Skipping.`);
                return;
            }

            // 4. Sanity Check
            if (quantity <= 0 || !isFinite(quantity)) {
                console.error(`[PaperExecution] Invalid Quantity Calculated: ${quantity}. Skipping.`);
                return;
            }

            console.log(`[PaperExecution] Executing Trade: ${signal.pair} | Qty: ${quantity} | Lev: ${finalLeverage}x | SL: ${overrides?.stopLoss}`);


            // Call Service to create trade
            await createPaperTrade(signal, userId, overrides, quantity, finalLeverage);

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
            .select('*')
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

        const tp = trade.take_profit;
        const sl = trade.stop_loss;

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
            await closePaperTrade(trade.signal_id, currentPrice, closeReason);
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
