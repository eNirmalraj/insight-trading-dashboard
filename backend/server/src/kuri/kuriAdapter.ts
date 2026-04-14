// backend/server/src/kuri/kuriAdapter.ts
// Unified Kuri engine adapter — replaces the old BackendVM
// Uses the same kuri-engine-full.js that powers the frontend chart renderer

import * as path from 'path';

// ── Load engine ──
// The engine is a UMD IIFE. In Node, require() MAY return module.exports,
// OR it may set globalThis.Kuri as a side effect, depending on how the
// bundler's UMD detection branch fires. We accept whichever works.
const enginePath = path.resolve(__dirname, '../../../../src/lib/kuri/kuri-engine-full.js');

function resolveKuriEngine(): any {
    // Check 1: already loaded in this process (hot-reload, previous require, etc.)
    let mod: any = (globalThis as any).Kuri;
    if (mod?.KuriEngine) return mod.KuriEngine;

    // Check 2: require() and use its return value (CJS path)
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const required = require(enginePath);
        if (required?.KuriEngine) return required.KuriEngine;
        // If require returned an empty module.exports, the UMD bundle likely
        // set a global instead — re-check globalThis.
        mod = (globalThis as any).Kuri;
        if (mod?.KuriEngine) return mod.KuriEngine;
    } catch (err: any) {
        throw new Error(
            `[KuriAdapter] require() failed for ${enginePath}: ${err.message}`,
        );
    }

    // Still nothing — dump what we can see for debugging
    const modKeys = Object.keys(((globalThis as any).Kuri || {}) as Record<string, any>);
    throw new Error(
        `[KuriAdapter] Failed to load KuriEngine from ${enginePath}. ` +
            `globalThis.Kuri keys: [${modKeys.join(', ')}]`,
    );
}

const KuriEngine = resolveKuriEngine();

// ── Types matching existing BackendVMOutput contract ──
export interface Context {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume?: number[];
    [key: string]: any;
}

export interface StrategySignal {
    type: 'ENTRY' | 'EXIT';
    direction?: 'LONG' | 'SHORT';
    id: string;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
    timestamp: number;
}

export interface BackendVMOutput {
    context: Context;
    signals: StrategySignal[];
    variables: Record<string, any>;
    stopLoss?: number;
    takeProfit?: number;
}

/**
 * Unified Kuri execution — replaces the old Kuri.executeWithVM().
 * Uses the same engine as the frontend chart renderer.
 */
export function executeKuri(script: string, context: Context): BackendVMOutput {
    const engine = new KuriEngine();
    const ohlcv = {
        open: context.open,
        high: context.high,
        low: context.low,
        close: context.close,
        volume: context.volume || context.close.map(() => 0),
        time: context.close.map((_, i) => i),
    };

    const result = engine.run(script, ohlcv);

    if (!result.success) {
        const errorMsg = result.errors.map((e: any) => e.message).join('; ');
        throw new Error(`Kuri execution failed: ${errorMsg}`);
    }

    // ── Extract strategy signals ──
    const signals: StrategySignal[] = [];

    // The engine's StrategyEngine stores orders in result.strategy?.orders
    const orders = (result as any).strategy?.orders || [];
    for (const order of orders) {
        if (order.type === 'entry') {
            signals.push({
                type: 'ENTRY',
                direction: order.direction?.toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
                id: order.id || 'default',
                price: context.close[context.close.length - 1],
                timestamp: context.close.length - 1,
            });
        } else if (order.type === 'exit' || order.type === 'close') {
            signals.push({
                type: 'EXIT',
                id: order.id || 'default',
                price: context.close[context.close.length - 1],
                timestamp: context.close.length - 1,
            });
        }
    }

    // ── Extract alertcondition signals as strategy signals ──
    if (signals.length === 0 && result.alerts) {
        for (const alert of result.alerts) {
            if (!alert.condition || !Array.isArray(alert.condition)) continue;
            const lastBar = context.close.length - 1;
            if (alert.condition[lastBar]) {
                const titleLower = (alert.title || '').toLowerCase();
                const isBuy = titleLower.includes('buy') || titleLower.includes('long');
                const isSell = titleLower.includes('sell') || titleLower.includes('short');
                if (isBuy || isSell) {
                    signals.push({
                        type: 'ENTRY',
                        direction: isBuy ? 'LONG' : 'SHORT',
                        id: alert.title || 'alert',
                        price: context.close[lastBar],
                        timestamp: lastBar,
                    });
                }
            }
        }
    }

    // ── Extract variables from seriesData ──
    const variables: Record<string, any> = {};
    if (result.seriesData) {
        for (const [key, value] of result.seriesData) {
            variables[key] = value;
        }
    }

    // ── Check for legacy buy_signal/sell_signal variables ──
    const lastIdx = context.close.length - 1;
    const buySignal = variables['buy_signal'];
    const sellSignal = variables['sell_signal'];
    if (signals.length === 0) {
        if (buySignal) {
            const val = Array.isArray(buySignal) ? buySignal[lastIdx] : buySignal;
            if (val) {
                signals.push({
                    type: 'ENTRY',
                    direction: 'LONG',
                    id: 'buy_signal',
                    price: context.close[lastIdx],
                    timestamp: lastIdx,
                });
            }
        }
        if (sellSignal) {
            const val = Array.isArray(sellSignal) ? sellSignal[lastIdx] : sellSignal;
            if (val) {
                signals.push({
                    type: 'ENTRY',
                    direction: 'SHORT',
                    id: 'sell_signal',
                    price: context.close[lastIdx],
                    timestamp: lastIdx,
                });
            }
        }
    }

    return {
        context,
        signals,
        variables,
        stopLoss: undefined,
        takeProfit: undefined,
    };
}

/**
 * Drop-in replacement for the old Kuri class.
 * Preserves the same static API so strategyEngine.ts needs minimal changes.
 */
export class Kuri {
    static executeWithVM(script: string, context: Context): BackendVMOutput {
        return executeKuri(script, context);
    }

    static execute(script: string, context: Context): any {
        return executeKuri(script, context);
    }
}
