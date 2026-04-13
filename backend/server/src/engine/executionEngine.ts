// backend/server/src/engine/executionEngine.ts
// Execution Engine — per-user, per-watchlist executor + SL/TP monitor.
//
// Listens for SIGNAL_CREATED events from the Signal Engine. For each signal:
//   1. Find all watchlist_strategies assignments matching (strategy_id, params, timeframe)
//   2. For each assignment whose watchlist contains the signal's symbol:
//      - Compute SL/TP from the assignment's risk_settings
//      - Insert a signal_executions row (user_id, watchlist_strategy_id)
//      - Dispatch to the configured broker adapter (paper by default)
//      - Subscribe to @bookTicker for the symbol so we can monitor SL/TP hits
//   3. For platform signals (watchlist_strategy_id=null): insert one execution
//      with user_id=null, visible to users with no watchlists
//
// Also handles PRICE_TICK events to close active executions on SL/TP hit, and
// a startup "replay" phase that re-loads active executions and checks for
// SL/TP hits during the downtime window using 1m historical klines.

import { supabaseAdmin } from '../services/supabaseAdmin';
import { eventBus, EngineEvents } from '../utils/eventBus';
import {
    insertExecution,
    loadActiveExecutions,
    closeExecution,
    SignalExecutionRow,
} from '../services/executionStorage';
import { binanceStream } from '../services/binanceStream';
import { computeRiskLevels, RiskSettings } from './riskCalculator';
import { brokerAdapters } from './brokerAdapters';
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
        // No more active executions for this symbol — stop streaming ticks.
        binanceStream.unsubscribeBookTicker(symbol).catch((err) =>
            console.error('[ExecutionEngine] unsubscribeBookTicker error:', err),
        );
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
            // Match by candle_time if possible; else use the latest
            const target = new Date(signal.candle_time).getTime() / 1000;
            const matched = candles.find((c) => c.time === Math.floor(target));
            return matched || candles[candles.length - 1];
        }
    } catch (err) {
        console.warn(`[ExecutionEngine] Could not fetch triggering candle: ${err}`);
    }
    // Fallback: dummy candle with entry_price as high/low/close
    return {
        time: new Date(signal.candle_time).getTime() / 1000,
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

        const exec = await insertExecution({
            signalId: signal.id,
            watchlistStrategyId: a.id,
            userId: a.watchlists?.user_id || null,
            symbol: signal.symbol,
            market: (signal.market as Market) || Market.FUTURES,
            direction,
            entryPrice: signal.entry_price,
            timeframe: signal.timeframe,
            stopLoss,
            takeProfit,
            lotSize: risk.lotSize ?? null,
            leverage: risk.leverage ?? null,
            broker: BrokerType.PAPER,
        });

        if (!exec) continue;

        addActive(exec);
        await binanceStream.subscribeBookTicker(signal.symbol);
        await brokerAdapters.execute(exec);
    }

    // 4. Platform execution: if NO user assignments matched (this signal was emitted
    //    by a platform-assignment in the scanner) AND params_snapshot matches a
    //    platform assignment, insert a platform execution row with user_id=null.
    //
    //    Detection: the signal's params_snapshot is empty {} (platform uses defaults)
    //    AND no watchlist assignments matched. This avoids double-inserting when
    //    users have their own copies.
    if (
        matchedAssignments.length === 0 &&
        Object.keys(signal.params_snapshot || {}).length === 0
    ) {
        const { stopLoss, takeProfit } = computeRiskLevels(
            signal.entry_price,
            direction,
            candle,
            {}, // default risk (candle mode, 1:2 RR)
        );

        const exec = await insertExecution({
            signalId: signal.id,
            watchlistStrategyId: null,
            userId: null,
            symbol: signal.symbol,
            market: (signal.market as Market) || Market.FUTURES,
            direction,
            entryPrice: signal.entry_price,
            timeframe: signal.timeframe,
            stopLoss,
            takeProfit,
            broker: BrokerType.PAPER,
        });

        if (exec) {
            addActive(exec);
            await binanceStream.subscribeBookTicker(signal.symbol);
            await brokerAdapters.execute(exec);
        }
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

    // Iterate a copy because closeExecution can remove entries from the map.
    for (const exec of [...list]) {
        let hitPrice: number | null = null;
        let reason: CloseReason | null = null;

        if (exec.direction === 'BUY') {
            // BUY closes at bid (sell into the bid).
            if (exec.stop_loss !== null && payload.bid <= exec.stop_loss) {
                hitPrice = payload.bid;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && payload.bid >= exec.take_profit) {
                hitPrice = payload.bid;
                reason = CloseReason.TP;
            }
        } else {
            // SELL closes at ask (buy back at the ask).
            if (exec.stop_loss !== null && payload.ask >= exec.stop_loss) {
                hitPrice = payload.ask;
                reason = CloseReason.SL;
            } else if (exec.take_profit !== null && payload.ask <= exec.take_profit) {
                hitPrice = payload.ask;
                reason = CloseReason.TP;
            }
        }

        if (hitPrice === null || reason === null) continue;

        const pnl = computePnL(exec, hitPrice);
        const closed = await closeExecution(exec.id, reason, hitPrice, pnl);

        if (closed) {
            removeActive(exec.id, exec.symbol);
            await brokerAdapters.onClose({
                ...exec,
                status: 'Closed',
                close_reason: reason,
                close_price: hitPrice,
                profit_loss: pnl,
                closed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }
    }
}

// ─── Replay of missed candles on startup ─────────────────────────

/**
 * Fetch 1m candles for a symbol covering a lookback window, then walk them
 * to detect any SL/TP hit for still-Active executions. Retroactively close
 * those executions with the correct price.
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
        const minutesBack = Math.min(Math.ceil((Date.now() - oldestMs) / 60_000) + 5, 1000);

        const klines = await fetchHistoricalCandles(symbol, '1m', minutesBack);

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

    // Subscribe to @bookTicker for every symbol still active after replay.
    for (const symbol of activeBySymbol.keys()) {
        await binanceStream.subscribeBookTicker(symbol);
    }
    console.log(`[ExecutionEngine] Prepared with ${activeBySymbol.size} active symbols`);
}

export async function startExecutionEngine(): Promise<void> {
    if (started) {
        console.log('[ExecutionEngine] Already started');
        return;
    }

    eventBus.on(EngineEvents.SIGNAL_CREATED, async (payload: SignalCreatedPayload) => {
        try {
            await handleNewSignal(payload);
        } catch (err) {
            console.error('[ExecutionEngine] handleNewSignal error:', err);
        }
    });

    eventBus.on(EngineEvents.PRICE_TICK, async (payload: PriceTickPayload) => {
        try {
            await handlePriceTick(payload);
        } catch (err) {
            console.error('[ExecutionEngine] handlePriceTick error:', err);
        }
    });

    started = true;
    console.log('[ExecutionEngine] Started successfully');
}

export function stopExecutionEngine(): void {
    activeBySymbol.clear();
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
