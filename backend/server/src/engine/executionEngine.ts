// backend/server/src/engine/executionEngine.ts
// Execution Engine — per-user, per-watchlist executor + SL/TP monitor.
//
// Listens for SIGNAL_CREATED events from the Signal Engine. For each signal:
//   1. Find all watchlist_strategies assignments matching (strategy_id, params, timeframe)
//   2. For each assignment whose watchlist contains the signal's symbol:
//      - Compute SL/TP from the assignment's risk_settings
//      - Insert a signal_executions row (user_id, watchlist_strategy_id)
//      - Dispatch to the configured broker adapter (paper by default)
//      - Ensure a 1m kline stream exists so we can monitor SL/TP hits
//
// Also handles PRICE_TICK events to close active executions on SL/TP hit, and
// a startup "replay" phase that re-loads active executions and checks for
// SL/TP hits during the downtime window using 1m historical klines.

import { supabaseAdmin } from '../services/supabaseAdmin';
import { eventBus, EngineEvents } from '../utils/eventBus';
import {
    loadActiveExecutions,
    closeExecution,
    SignalExecutionRow,
} from '../services/executionStorage';
import { binanceStream } from '../services/binanceStream';
import { computeRiskLevels, RiskSettings } from './riskCalculator';
import { brokerAdapters } from './brokerAdapters';
import { oms } from '../services/oms';
import {
    TradeDirection,
    Market,
    CloseReason,
    BrokerType,
} from '../constants/enums';
import { Candle } from './strategyRunner';
import { fetchHistoricalCandles } from './signalEngine';

// ─── In-memory state ─────────────────────────────────────────────

// Active executions grouped by symbol, so the tick handler can look up
// in O(1) which executions to check on each @bookTicker frame.
const activeBySymbol: Map<string, SignalExecutionRow[]> = new Map();
// Module-scope log throttle map — one entry per symbol, cleared when
// removeActive() drops a symbol.
const lastTickLog: Map<string, number> = new Map();
let started = false;

function addActive(exec: SignalExecutionRow): void {
    const list = activeBySymbol.get(exec.symbol) || [];
    if (list.some((e) => e.id === exec.id)) return;
    list.push(exec);
    activeBySymbol.set(exec.symbol, list);
}

function removeActive(execId: string, symbol: string): void {
    const list = activeBySymbol.get(symbol);
    if (!list) return;
    const filtered = list.filter((e) => e.id !== execId);
    if (filtered.length === 0) {
        activeBySymbol.delete(symbol);
        lastTickLog.delete(symbol); // Free log throttle entry
    } else {
        activeBySymbol.set(symbol, filtered);
    }
}

function computePnL(exec: SignalExecutionRow, closePrice: number): number {
    const entry = exec.entry_price;
    const lotSize = exec.lot_size || 1;
    const lev = exec.leverage || 1;
    if (exec.direction === 'BUY') {
        return (closePrice - entry) * lotSize * lev;
    }
    return (entry - closePrice) * lotSize * lev;
}

// ─── Signal fan-out ──────────────────────────────────────────────

interface SignalCreatedPayload {
    signal: {
        id: string;
        strategy_id: string;
        symbol: string;
        market: string;
        direction: string;
        entry_price: number;
        timeframe: string;
        candle_time: string;
        params_snapshot: Record<string, any>;
    };
    triggered_by: 'candle' | 'cold_start' | 'replay';
}

/**
 * Convert an entry price into a dummy Candle for risk calculation.
 * We only need the high/low for candle-based SL/TP, but SIGNAL_CREATED events
 * don't carry the raw candle. Fetch the last 1m klines and use those.
 *
 * For now, fall back to using entry_price as high/low if fetch fails.
 * This produces a tight stop but won't crash the flow.
 */
async function resolveTriggeringCandle(signal: SignalCreatedPayload['signal']): Promise<Candle> {
    try {
        const candles = await fetchHistoricalCandles(signal.symbol, signal.timeframe, 3);
        if (candles.length > 0) {
            // Fuzzy match: find the candle whose open time is closest to the
            // signal's candle_time. Exact-equality comparison is brittle because
            // of potential sub-second drift from timezone/rounding. Candles
            // are spaced by at least 60s so a ±30s window is safe.
            const target = Math.round(new Date(signal.candle_time).getTime() / 1000);
            let best: Candle | null = null;
            let bestDiff = Infinity;
            for (const c of candles) {
                const diff = Math.abs(c.time - target);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    best = c;
                }
            }
            if (best && bestDiff <= 30) return best;
            return candles[candles.length - 1]; // fall back to latest
        }
    } catch (err) {
        console.warn(`[ExecutionEngine] Could not fetch triggering candle: ${err}`);
    }
    // Fallback: dummy candle with entry_price as high/low/close
    return {
        time: Math.round(new Date(signal.candle_time).getTime() / 1000),
        open: signal.entry_price,
        high: signal.entry_price,
        low: signal.entry_price,
        close: signal.entry_price,
        volume: 0,
    };
}

async function handleNewSignal(payload: SignalCreatedPayload): Promise<void> {
    const signal = payload.signal;
    const direction = signal.direction === 'SELL' ? TradeDirection.SELL : TradeDirection.BUY;

    const candle = await resolveTriggeringCandle(signal);

    // 1. Load watchlist_strategies that match this signal.
    //    We match by strategy_id + timeframe. Params equality is a second check.
    const { data: rows, error } = await supabaseAdmin
        .from('watchlist_strategies')
        .select(
            `
            id, watchlist_id, params, timeframe, risk_settings,
            watchlists:watchlist_id ( id, user_id )
        `,
        )
        .eq('strategy_id', signal.strategy_id)
        .eq('timeframe', signal.timeframe);

    if (error) {
        console.error('[ExecutionEngine] Failed to load matching assignments:', error.message);
        return;
    }

    // 2. Batch-fetch the symbol rows for those watchlists.
    const matchedAssignments: Array<any> = [];
    if (rows && rows.length > 0) {
        const wlIds = Array.from(new Set(rows.map((r: any) => r.watchlist_id)));
        const { data: items } = await supabaseAdmin
            .from('watchlist_items')
            .select('watchlist_id, symbol, market')
            .in('watchlist_id', wlIds)
            .eq('symbol', signal.symbol);

        const wlWithSymbol = new Set((items || []).map((i: any) => i.watchlist_id));

        for (const r of rows as any[]) {
            if (!wlWithSymbol.has(r.watchlist_id)) continue;
            // Params must match exactly — the scanner emitted with a specific param set,
            // so only assignments with the SAME params are relevant.
            if (JSON.stringify(r.params || {}) !== JSON.stringify(signal.params_snapshot || {})) {
                continue;
            }
            matchedAssignments.push(r);
        }
    }

    // 3. For each matched assignment, insert an execution row.
    for (const a of matchedAssignments) {
        const risk: RiskSettings = a.risk_settings || {};
        const { stopLoss, takeProfit } = computeRiskLevels(
            signal.entry_price,
            direction,
            candle,
            risk,
        );

        let exec;
        try {
            exec = await oms.submit({
                userId: a.watchlists?.user_id || null,
                broker: BrokerType.PAPER,
                brokerCredentialId: null,
                signalId: signal.id,
                watchlistStrategyId: a.id,
                symbol: signal.symbol,
                market: (signal.market as Market) || Market.FUTURES,
                direction,
                entryType: 'MARKET',
                entryPrice: signal.entry_price,
                stopLoss,
                takeProfit,
                riskSettings: risk,
                timeframe: signal.timeframe,
            });
        } catch (err: any) {
            console.error('[ExecutionEngine] oms.submit failed:', err?.message || err);
            continue;
        }

        if (!exec) continue;

        // Ensure the kline stream covers this symbol BEFORE adding to
        // activeBySymbol so the tick handler can't be called with no stream.
        await binanceStream.ensureKlineStream(signal.symbol);
        addActive(exec);
    }

}

// ─── Tick-level SL/TP monitoring ─────────────────────────────────

interface PriceTickPayload {
    symbol: string;
    bid: number;
    ask: number;
    ts: number;
}

async function handlePriceTick(payload: PriceTickPayload): Promise<void> {
    const list = activeBySymbol.get(payload.symbol);
    if (!list || list.length === 0) return;

    // Debug: log every 60s per symbol to confirm ticks are flowing
    const now = Date.now();
    const lastLog = lastTickLog.get(payload.symbol) || 0;
    if (now - lastLog > 60_000) {
        lastTickLog.set(payload.symbol, now);
        console.log(
            `[ExecutionEngine] 📊 Tick for ${payload.symbol}: mid=${((payload.bid + payload.ask) / 2).toFixed(2)} | ${list.length} active executions | SL/TP: ${list.map((e) => `${e.id.slice(0, 6)}… SL=${e.stop_loss} TP=${e.take_profit}`).join(', ')}`,
        );
    }

    // Iterate a copy because closeExecution can remove entries from the map.
    for (const exec of [...list]) {
        let hitPrice: number | null = null;
        let reason: CloseReason | null = null;

        // Use mid price (avg of bid+ask) for SL/TP checks.
        // This matches the "last price" the frontend displays (from miniTicker),
        // avoiding the confusing scenario where the UI shows TP reached but
        // the raw bid hasn't crossed due to the spread.
        const midPrice = (payload.bid + payload.ask) / 2;

        if (exec.direction === 'BUY') {
            if (exec.stop_loss !== null && midPrice <= exec.stop_loss) {
                hitPrice = midPrice;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && midPrice >= exec.take_profit) {
                hitPrice = midPrice;
                reason = CloseReason.TP;
            }
        } else {
            if (exec.stop_loss !== null && midPrice >= exec.stop_loss) {
                hitPrice = midPrice;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && midPrice <= exec.take_profit) {
                hitPrice = midPrice;
                reason = CloseReason.TP;
            }
        }

        if (hitPrice === null || reason === null) continue;

        // Remove from in-memory map SYNCHRONOUSLY before awaiting the DB call.
        // This prevents subsequent ticks (arriving during the await) from
        // re-evaluating the same execution. If the DB close fails, we re-add.
        removeActive(exec.id, exec.symbol);

        const pnl = computePnL(exec, hitPrice);
        const closed = await closeExecution(exec.id, reason, hitPrice, pnl);

        if (closed) {
            await brokerAdapters.onClose({
                ...exec,
                status: 'Closed',
                close_reason: reason,
                close_price: hitPrice,
                profit_loss: pnl,
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        } else {
            // DB close failed (transient Supabase error, or already closed by
            // a competing path). Re-add to memory so the next tick retries.
            // If the row is actually already Closed, the atomic WHERE guard
            // will make the next close a no-op as well — safe either way.
            addActive(exec);
        }
    }
}

// ─── Candle-close SL/TP fallback ─────────────────────────────────
// Runs on every CANDLE_CLOSED event. Uses the candle's high/low to check
// if any active execution's SL/TP was hit during that candle. This catches
// SL/TP hits even when the bookTicker shard is disconnected.

async function handleCandleCloseSLTP(symbol: string, candle: Candle): Promise<void> {
    const list = activeBySymbol.get(symbol);
    if (!list || list.length === 0) return;

    for (const exec of [...list]) {
        let hitPrice: number | null = null;
        let reason: CloseReason | null = null;

        // Gap-aware fill pricing: if the candle OPENED past the SL/TP level,
        // the realistic fill is the open, not the level itself.
        // Otherwise, the level was crossed mid-candle so we fill at the level.
        if (exec.direction === 'BUY') {
            if (exec.stop_loss !== null && candle.low <= exec.stop_loss) {
                hitPrice = candle.open < exec.stop_loss ? candle.open : exec.stop_loss;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && candle.high >= exec.take_profit) {
                hitPrice = candle.open > exec.take_profit ? candle.open : exec.take_profit;
                reason = CloseReason.TP;
            }
        } else {
            if (exec.stop_loss !== null && candle.high >= exec.stop_loss) {
                hitPrice = candle.open > exec.stop_loss ? candle.open : exec.stop_loss;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && candle.low <= exec.take_profit) {
                hitPrice = candle.open < exec.take_profit ? candle.open : exec.take_profit;
                reason = CloseReason.TP;
            }
        }

        if (hitPrice === null || reason === null) continue;

        // Remove synchronously before awaiting the DB — prevents a concurrent
        // tick from re-evaluating the same exec. Re-added on DB failure.
        removeActive(exec.id, exec.symbol);

        const pnl = computePnL(exec, hitPrice);
        const closed = await closeExecution(exec.id, reason, hitPrice, pnl);

        if (closed) {
            console.log(
                `[ExecutionEngine] 🕯️ Candle-close SL/TP hit: ${exec.id.slice(0, 8)} ${symbol} ${reason} @ ${hitPrice}`,
            );
            await brokerAdapters.onClose({
                ...exec,
                status: 'Closed',
                close_reason: reason,
                close_price: hitPrice,
                profit_loss: pnl,
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        } else {
            addActive(exec);
        }
    }
}

// ─── Replay of missed candles on startup ─────────────────────────

/**
 * Fetch historical candles for a symbol covering the lookback window and
 * walk them to detect any SL/TP hit for still-Active executions. The
 * timeframe is adaptive: 1m candles for windows up to ~16h, 5m up to ~3.5
 * days, 1h for anything beyond. This avoids the 1000-bar cap silently
 * dropping hits when the worker was down for a long time.
 */
async function replayMissedCandles(): Promise<void> {
    const actives = await loadActiveExecutions();
    if (actives.length === 0) return;

    console.log(`[ExecutionEngine] Replaying missed candles for ${actives.length} active executions`);

    // Group by symbol so we only fetch once per symbol.
    const bySymbol = new Map<string, SignalExecutionRow[]>();
    for (const exec of actives) {
        const list = bySymbol.get(exec.symbol) || [];
        list.push(exec);
        bySymbol.set(exec.symbol, list);
    }

    for (const [symbol, execs] of bySymbol) {
        const oldestMs = Math.min(...execs.map((e) => new Date(e.created_at).getTime()));
        const minutesSinceOldest = Math.ceil((Date.now() - oldestMs) / 60_000) + 5;

        // Pick a timeframe that covers the window within 1500 bars (Binance limit).
        let tf: string;
        let bars: number;
        if (minutesSinceOldest <= 1000) {
            tf = '1m';
            bars = minutesSinceOldest;
        } else if (minutesSinceOldest <= 5000) {
            tf = '5m';
            bars = Math.ceil(minutesSinceOldest / 5);
        } else {
            tf = '1h';
            bars = Math.min(Math.ceil(minutesSinceOldest / 60), 1500);
            console.warn(
                `[ExecutionEngine] Long replay window for ${symbol}: ${Math.floor(minutesSinceOldest / 60)}h — using 1h klines (SL/TP precision reduced)`,
            );
        }

        const klines = await fetchHistoricalCandles(symbol, tf, bars);

        if (klines.length === 0) {
            execs.forEach(addActive);
            continue;
        }

        for (const exec of execs) {
            const execStartSec = Math.floor(new Date(exec.created_at).getTime() / 1000);
            let hit: { price: number; reason: CloseReason } | null = null;

            for (const k of klines) {
                if (k.time < execStartSec) continue;
                if (exec.direction === 'BUY') {
                    if (exec.stop_loss !== null && k.low <= exec.stop_loss) {
                        hit = { price: exec.stop_loss, reason: CloseReason.SL };
                        break;
                    }
                    if (exec.take_profit !== null && k.high >= exec.take_profit) {
                        hit = { price: exec.take_profit, reason: CloseReason.TP };
                        break;
                    }
                } else {
                    if (exec.stop_loss !== null && k.high >= exec.stop_loss) {
                        hit = { price: exec.stop_loss, reason: CloseReason.SL };
                        break;
                    }
                    if (exec.take_profit !== null && k.low <= exec.take_profit) {
                        hit = { price: exec.take_profit, reason: CloseReason.TP };
                        break;
                    }
                }
            }

            if (hit) {
                const pnl = computePnL(exec, hit.price);
                const closed = await closeExecution(exec.id, hit.reason, hit.price, pnl);
                if (closed) {
                    console.log(
                        `[ExecutionEngine] Replay closed ${exec.id} reason=${hit.reason} price=${hit.price}`,
                    );
                    continue;
                }
            }

            addActive(exec);
        }
    }

    console.log('[ExecutionEngine] Replay complete');
}

// ─── Lifecycle ───────────────────────────────────────────────────

/**
 * Run before startSignalEngine() to populate active executions and replay downtime.
 */
export async function prepareExecutionEngine(): Promise<void> {
    await replayMissedCandles();

    // Ensure every active execution's symbol has a kline stream for live price ticks.
    // This handles the case where the assignment was removed but the execution is still open.
    for (const symbol of activeBySymbol.keys()) {
        await binanceStream.ensureKlineStream(symbol);
    }
    console.log(`[ExecutionEngine] Prepared with ${activeBySymbol.size} active symbols`);
}

// Handler references kept so stopExecutionEngine can detach them cleanly.
let signalCreatedHandler: ((payload: SignalCreatedPayload) => Promise<void>) | null = null;
let priceTickHandler: ((payload: PriceTickPayload) => Promise<void>) | null = null;
let candleClosedHandler: ((payload: { symbol: string; timeframe: string; candle: Candle }) => Promise<void>) | null = null;

export async function startExecutionEngine(): Promise<void> {
    if (started) {
        console.log('[ExecutionEngine] Already started');
        return;
    }

    signalCreatedHandler = async (payload) => {
        try {
            await handleNewSignal(payload);
        } catch (err) {
            console.error('[ExecutionEngine] handleNewSignal error:', err);
        }
    };
    priceTickHandler = async (payload) => {
        try {
            await handlePriceTick(payload);
        } catch (err) {
            console.error('[ExecutionEngine] handlePriceTick error:', err);
        }
    };
    candleClosedHandler = async (payload) => {
        try {
            await handleCandleCloseSLTP(payload.symbol, payload.candle);
        } catch (err) {
            console.error('[ExecutionEngine] handleCandleCloseSLTP error:', err);
        }
    };

    eventBus.on(EngineEvents.SIGNAL_CREATED, signalCreatedHandler);
    eventBus.on(EngineEvents.PRICE_TICK, priceTickHandler);
    // Fallback: check SL/TP on every candle close using the candle's high/low.
    // Catches cases where ticks are not flowing. Runs at candle-close frequency.
    eventBus.on(EngineEvents.CANDLE_CLOSED, candleClosedHandler);

    started = true;
    console.log('[ExecutionEngine] Started successfully');
}

export function stopExecutionEngine(): void {
    if (signalCreatedHandler) {
        eventBus.off(EngineEvents.SIGNAL_CREATED, signalCreatedHandler);
        signalCreatedHandler = null;
    }
    if (priceTickHandler) {
        eventBus.off(EngineEvents.PRICE_TICK, priceTickHandler);
        priceTickHandler = null;
    }
    if (candleClosedHandler) {
        eventBus.off(EngineEvents.CANDLE_CLOSED, candleClosedHandler);
        candleClosedHandler = null;
    }
    activeBySymbol.clear();
    lastTickLog.clear();
    started = false;
    console.log('[ExecutionEngine] Stopped');
}

export function getExecutionEngineStatus(): object {
    let total = 0;
    activeBySymbol.forEach((list) => (total += list.length));
    return {
        running: started,
        activeExecutions: total,
        symbolsMonitored: activeBySymbol.size,
    };
}
