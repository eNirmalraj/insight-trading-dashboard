// backend/server/src/engine/signalEngine.ts
// Signal Engine — SCANNER.
//
// Responsibility: detect strategy triggers on closed candles and write one row
// to the `signals` table per unique event. Does NOT manage per-user execution
// state — that's the Execution Engine's job.
//
// Flow per candle close:
//   CANDLE_CLOSED → loadAssignments matching (symbol, timeframe)
//                 → runStrategy(kuriSource, params, buffer)
//                 → insertSignal(event) [unique index prevents duplicates]
//                 → emits SIGNAL_CREATED via signalStorage
//
// The Execution Engine listens for SIGNAL_CREATED and fans out per-user
// executions with their own risk settings.

import ccxt from 'ccxt';
import { Candle } from './indicators';
import { runStrategy, Candle as RunnerCandle } from './strategyRunner';
import { insertSignal } from '../services/signalStorage';
import { binanceStream } from '../services/binanceStream';
import { TradeDirection, Market } from '../constants/enums';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { supabaseAdmin } from '../services/supabaseAdmin';
import * as symSvc from '../services/symbolService';

// ─── In-memory state ─────────────────────────────────────────────

const candleBuffer: Map<string, Candle[]> = new Map();
const BUFFER_SIZE = 200;

let exchange = new ccxt.binance({
    enableRateLimit: true,
    timeout: 5000,
    options: { defaultType: 'future' },
});

interface Assignment {
    id: string;                  // 'platform-*' for synthetic, uuid for DB rows
    watchlist_id: string | null;
    user_id: string | null;
    strategy_id: string;         // uuid
    strategy_name: string;       // legacy signals.strategy column
    strategy_source: string;     // Kuri source code
    template_version: string;    // 8-char hash
    params: Record<string, any>;
    timeframe: string;
    symbols: string[];           // canonical Binance-native symbols
    market: Market;
}

let assignments: Assignment[] = [];
let started = false;
let configReloadInterval: NodeJS.Timeout | null = null;
// One-shot flags to prevent listener/channel accumulation across retry loops.
let candleListenerRegistered = false;
let realtimeChannelRegistered = false;

// ─── Historical candle fetch ─────────────────────────────────────

/**
 * Fetch historical candles for a canonical symbol (e.g. 'BTCUSDT').
 * Converts to CCXT slash format internally.
 */
export const fetchHistoricalCandles = async (
    symbol: string,
    timeframe: string,
    limit: number = BUFFER_SIZE,
): Promise<Candle[]> => {
    try {
        const ccxtSymbol = symSvc.toCCXT({ symbol, market: Market.FUTURES });
        const ohlcv = await exchange.fetchOHLCV(ccxtSymbol, timeframe.toLowerCase(), undefined, limit);
        return ohlcv.map((c: any) => ({
            time: Math.floor(c[0] / 1000),
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
        }));
    } catch (error) {
        console.error(`[SignalEngine] fetchHistoricalCandles failed for ${symbol} ${timeframe}:`, error);
        return [];
    }
};

// ─── Assignment loading ──────────────────────────────────────────

async function loadAssignments(): Promise<Assignment[]> {
    const result: Assignment[] = [];

    // 1. User watchlist assignments from watchlist_strategies
    const { data: rows, error } = await supabaseAdmin
        .from('watchlist_strategies')
        .select(
            `
            id,
            watchlist_id,
            strategy_id,
            params,
            timeframe,
            risk_settings,
            watchlists:watchlist_id ( id, user_id ),
            scripts:strategy_id ( id, name, source_code, template_version )
        `,
        );

    if (error) {
        console.error('[SignalEngine] Failed to load watchlist_strategies:', error.message);
    }

    if (rows && rows.length > 0) {
        // Batch-load all watchlist items for the referenced watchlists.
        const wlIds = Array.from(new Set(rows.map((r: any) => r.watchlist_id)));
        const { data: items } = await supabaseAdmin
            .from('watchlist_items')
            .select('watchlist_id, symbol, market')
            .in('watchlist_id', wlIds);

        const itemsByWl = new Map<string, Array<{ symbol: string; market: string }>>();
        (items || []).forEach((i: any) => {
            const list = itemsByWl.get(i.watchlist_id) || [];
            list.push({ symbol: i.symbol, market: i.market });
            itemsByWl.set(i.watchlist_id, list);
        });

        for (const row of rows as any[]) {
            const script = row.scripts;
            const wl = row.watchlists;
            if (!script || !script.source_code) continue;

            const symbols = (itemsByWl.get(row.watchlist_id) || []).map((i) => i.symbol);
            if (symbols.length === 0) continue;

            // Determine market: use the first item's market (watchlists are homogeneous
            // in practice). Future: per-item market support.
            const firstItem = itemsByWl.get(row.watchlist_id)?.[0];
            const market = (firstItem?.market as Market) || Market.FUTURES;

            result.push({
                id: row.id,
                watchlist_id: row.watchlist_id,
                user_id: wl?.user_id || null,
                strategy_id: row.strategy_id,
                strategy_name: script.name,
                strategy_source: script.source_code,
                template_version: script.template_version || '',
                params: row.params || {},
                timeframe: row.timeframe,
                symbols,
                market,
            });
        }
    }

    return result;
}

async function setLastError(assignmentId: string, message: string): Promise<void> {
    // Platform assignments don't have DB rows — nothing to mark.
    if (assignmentId.startsWith('platform-')) return;
    await supabaseAdmin
        .from('watchlist_strategies')
        .update({ last_error: message, last_error_at: new Date().toISOString() })
        .eq('id', assignmentId);
}

async function clearLastError(assignmentId: string): Promise<void> {
    if (assignmentId.startsWith('platform-')) return;
    await supabaseAdmin
        .from('watchlist_strategies')
        .update({ last_error: null, last_error_at: null })
        .eq('id', assignmentId)
        .not('last_error', 'is', null);
}

// ─── Timeframe normalization ─────────────────────────────────────

/**
 * Canonicalize a timeframe string so the DB (and downstream filters) always
 * sees the same casing regardless of source.
 *
 * Binance WebSocket emits lowercase ('1h', '4h', '1d'), the frontend UI uses
 * uppercase ('1H', '4H', '1D'). We normalize sub-hour values to lowercase
 * (1m, 5m, 15m, 30m) and hour+ values to uppercase (1H, 4H, 1D, 1W, 1M).
 * This matches the favoriteTimeframes list in Signals.tsx.
 */
function normalizeTimeframe(tf: string): string {
    // Monthly: keep exact 'M' casing — lowercase 'm' means minute on Binance.
    // We check the raw unit letter BEFORE lowercasing to distinguish them.
    const unit = tf.slice(-1);
    const num = tf.slice(0, -1);
    if (unit === 'M') return `${num}M`;           // months: 1M
    if (unit === 'm') return `${num}m`;           // minutes: 1m, 5m, 15m, 30m
    return `${num}${unit.toUpperCase()}`;         // hours/days/weeks: 1H, 4H, 1D, 1W
}

// ─── Candle close handling ───────────────────────────────────────

async function onCandleClose(symbol: string, timeframe: string, candle: Candle): Promise<void> {
    const bufferKey = `${symbol}_${timeframe}`;
    let buffer = candleBuffer.get(bufferKey) || [];
    buffer.push(candle);
    if (buffer.length > BUFFER_SIZE) buffer = buffer.slice(-BUFFER_SIZE);
    candleBuffer.set(bufferKey, buffer);

    if (buffer.length < 50) return;

    // Find assignments that care about this (symbol, timeframe).
    const matching = assignments.filter(
        (a) =>
            a.symbols.includes(symbol) &&
            a.timeframe.toLowerCase() === timeframe.toLowerCase(),
    );
    if (matching.length === 0) return;

    const runnerBuffer: RunnerCandle[] = buffer.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
    }));

    for (const a of matching) {
        const result = runStrategy({
            kuriSource: a.strategy_source,
            params: a.params,
            candles: runnerBuffer,
        });

        if (result.error) {
            await setLastError(a.id, result.error);
            continue;
        }
        await clearLastError(a.id);

        for (const sig of result.signals) {
            const direction = sig.direction === 'SHORT' ? TradeDirection.SELL : TradeDirection.BUY;
            await insertSignal({
                strategyId: a.strategy_id,
                strategyName: a.strategy_name,
                symbol,
                market: a.market,
                direction,
                entryPrice: candle.close,
                timeframe: normalizeTimeframe(timeframe),
                candleTime: new Date(candle.time * 1000).toISOString(),
                paramsSnapshot: a.params,
                templateVersion: a.template_version,
            });
            // insertSignal emits SIGNAL_CREATED on success (unique index handles dedupe)
        }
    }
}

// ─── Cold-start scan ─────────────────────────────────────────────

async function coldStartScan(): Promise<void> {
    console.log('[SignalEngine] Running cold-start scan...');
    let emitted = 0;

    for (const a of assignments) {
        for (const symbol of a.symbols) {
            const bufferKey = `${symbol}_${a.timeframe}`;
            const buffer = candleBuffer.get(bufferKey);
            if (!buffer || buffer.length < 50) continue;

            const runnerBuffer: RunnerCandle[] = buffer.map((c) => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
            }));

            const result = runStrategy({
                kuriSource: a.strategy_source,
                params: a.params,
                candles: runnerBuffer,
            });

            if (result.error) {
                await setLastError(a.id, result.error);
                continue;
            }

            for (const sig of result.signals) {
                const lastCandle = buffer[buffer.length - 1];
                const direction = sig.direction === 'SHORT' ? TradeDirection.SELL : TradeDirection.BUY;
                const row = await insertSignal({
                    strategyId: a.strategy_id,
                    strategyName: a.strategy_name,
                    symbol,
                    market: a.market,
                    direction,
                    entryPrice: lastCandle.close,
                    timeframe: normalizeTimeframe(a.timeframe),
                    candleTime: new Date(lastCandle.time * 1000).toISOString(),
                    paramsSnapshot: a.params,
                    templateVersion: a.template_version,
                });
                if (row) emitted++;
            }
        }
    }
    console.log(`[SignalEngine] Cold-start scan emitted ${emitted} new signal(s)`);
}

// ─── Buffer initialization ───────────────────────────────────────

async function initializeBuffers(symbols: string[], timeframes: string[]): Promise<void> {
    console.log(`[SignalEngine] Initializing buffers for ${symbols.length} symbols × ${timeframes.length} timeframes`);
    const BATCH_SIZE = 10;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        await Promise.all(
            batch.map(async (symbol) => {
                for (const tf of timeframes) {
                    const candles = await fetchHistoricalCandles(symbol, tf, BUFFER_SIZE);
                    if (candles.length > 0) candleBuffer.set(`${symbol}_${tf}`, candles);
                }
            }),
        );
        // Rate limit pacing
        await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`[SignalEngine] Initialized ${candleBuffer.size} buffers`);
}

// ─── Lifecycle ───────────────────────────────────────────────────

export async function startSignalEngine(): Promise<void> {
    if (started) {
        console.log('[SignalEngine] Already started');
        return;
    }

    console.log('[SignalEngine] Starting...');

    // Register the CANDLE_CLOSED listener ONCE — even across retry loops.
    // Otherwise each 60s empty-assignments retry would accumulate listeners,
    // causing duplicate signal generation.
    if (!candleListenerRegistered) {
        eventBus.on(EngineEvents.CANDLE_CLOSED, async (payload: any) => {
            try {
                await onCandleClose(payload.symbol, payload.timeframe, payload.candle);
            } catch (err) {
                console.error('[SignalEngine] onCandleClose error:', err);
            }
        });
        candleListenerRegistered = true;
    }

    assignments = await loadAssignments();
    console.log(`[SignalEngine] Loaded ${assignments.length} assignments`);
    for (const a of assignments) {
        console.log(`[SignalEngine]   → ${a.strategy_name} | TF=${a.timeframe} | symbols=${a.symbols.length} | id=${a.id.slice(0, 8)}`);
    }

    if (assignments.length === 0) {
        console.log('[SignalEngine] No assignments — engine idle, will retry in 60s');
        setTimeout(() => startSignalEngine(), 60000);
        return;
    }

    // Collect unique (symbol, timeframe) combos
    const symbolSet = new Set<string>();
    const tfSet = new Set<string>();
    for (const a of assignments) {
        a.symbols.forEach((s) => symbolSet.add(s));
        tfSet.add(a.timeframe);
    }

    const symbols = Array.from(symbolSet);
    const timeframes = Array.from(tfSet);

    await initializeBuffers(symbols, timeframes);

    // Cold-start scan: run each assignment once against the buffer we just filled.
    // Dedupe index prevents re-emitting signals we've already saved on prior restarts.
    await coldStartScan();

    // Start Binance WebSocket kline subscriptions
    await binanceStream.subscribe(symbols, timeframes);

    // Supabase Realtime: reload assignments on watchlist_strategies changes.
    // Register once — subsequent retries of startSignalEngine reuse this.
    if (!realtimeChannelRegistered) {
        supabaseAdmin
            .channel('watchlist-strategies-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist_strategies' }, async () => {
                assignments = await loadAssignments();
                console.log(`[SignalEngine] Reloaded ${assignments.length} assignments (realtime)`);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist_items' }, async () => {
                assignments = await loadAssignments();
                console.log(`[SignalEngine] Reloaded ${assignments.length} assignments (watchlist_items)`);
            })
            .subscribe();
        realtimeChannelRegistered = true;
    }

    // Safety-net polling fallback in case Realtime drops silently (Risk R1).
    if (!configReloadInterval) {
        configReloadInterval = setInterval(async () => {
            try {
                assignments = await loadAssignments();
                console.log(`[SignalEngine] Safety-net reloaded ${assignments.length} assignments`);
            } catch (err) {
                console.error('[SignalEngine] Safety-net reload error:', err);
            }
        }, 60 * 1000);
    }

    started = true;
    console.log('[SignalEngine] Started successfully');
}

export function stopSignalEngine(): void {
    binanceStream.disconnect();
    candleBuffer.clear();
    if (configReloadInterval) {
        clearInterval(configReloadInterval);
        configReloadInterval = null;
    }
    started = false;
    console.log('[SignalEngine] Stopped');
}

export function getSignalEngineStatus(): object {
    const streamStatus = binanceStream.getStatus();
    return {
        running: started,
        assignments: assignments.length,
        bufferedPairs: candleBuffer.size,
        subscriptions: streamStatus.subscriptionCount,
        wsShards: streamStatus.shards,
    };
}
