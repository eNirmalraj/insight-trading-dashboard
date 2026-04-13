// backend/server/src/engine/strategyRunner.ts
// Single entry point for executing a strategy script against a candle buffer.
// Wraps executeKuri(), applies param overrides, and captures errors non-fatally.

import { executeKuri, Context } from '../kuri/kuriAdapter';

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface StrategyRunInput {
    kuriSource: string;
    params: Record<string, any>;
    candles: Candle[];
}

export interface TriggeredSignal {
    direction: 'LONG' | 'SHORT';
    id: string;
    timestamp: number;
}

export interface StrategyRunResult {
    signals: TriggeredSignal[];
    error?: string;
}

/**
 * Run a Kuri strategy script.
 * - kuriSource is the full .kuri file content (with frontmatter)
 * - params override the script's param defaults
 * - candles is the historical buffer
 * - Returns only signals that fired on the LAST candle (real-time semantics)
 */
export function runStrategy(input: StrategyRunInput): StrategyRunResult {
    const { kuriSource, params, candles } = input;

    if (!candles || candles.length === 0) {
        return { signals: [], error: 'No candles provided' };
    }

    try {
        const context: Context = {
            open: candles.map((c) => c.open),
            high: candles.map((c) => c.high),
            low: candles.map((c) => c.low),
            close: candles.map((c) => c.close),
            volume: candles.map((c) => c.volume),
            // Inject params as input overrides (executeKuri/KuriEngine will pick these up)
            ...params,
        };

        const result = executeKuri(kuriSource, context);
        const latestIndex = candles.length - 1;

        const triggered: TriggeredSignal[] = [];
        for (const sig of result.signals) {
            if (sig.type !== 'ENTRY') continue;
            if (sig.timestamp !== latestIndex) continue;
            triggered.push({
                direction: sig.direction === 'SHORT' ? 'SHORT' : 'LONG',
                id: sig.id || 'default',
                timestamp: latestIndex,
            });
        }

        return { signals: triggered };
    } catch (err: any) {
        return { signals: [], error: err?.message || String(err) };
    }
}
