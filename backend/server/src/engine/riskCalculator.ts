// backend/server/src/engine/riskCalculator.ts
// Computes stop_loss and take_profit for a signal execution based on the
// watchlist_strategies.risk_settings JSON and the triggering candle.
//
// Supported risk modes:
//   - { mode: 'candle', rrRatio: 2 }       — SL = candle low/high, TP = rrRatio × risk
//   - { mode: 'percent', slPercent: 0.02, tpPercent: 0.04 }
//   - { mode: 'fixed', slDistance: 100, tpDistance: 200 } — absolute price distance

import { TradeDirection } from '../constants/enums';
import { Candle } from './strategyRunner';

export interface RiskSettings {
    mode?: 'candle' | 'percent' | 'fixed';
    rrRatio?: number;        // for candle mode
    slPercent?: number;      // for percent mode (e.g. 0.02 = 2%)
    tpPercent?: number;
    slDistance?: number;     // for fixed mode (price units)
    tpDistance?: number;
    lotSize?: number;
    leverage?: number;
}

export interface RiskLevels {
    stopLoss: number;
    takeProfit: number;
}

const CANDLE_BUFFER = 0.001; // 0.1% below/above wick

export function computeRiskLevels(
    entryPrice: number,
    direction: TradeDirection,
    candle: Candle,
    risk: RiskSettings = {},
): RiskLevels {
    const mode = risk.mode || 'candle';

    if (mode === 'candle') {
        const rr = risk.rrRatio ?? 2;
        const stopLoss =
            direction === TradeDirection.BUY
                ? candle.low * (1 - CANDLE_BUFFER)
                : candle.high * (1 + CANDLE_BUFFER);
        const riskDist = Math.abs(entryPrice - stopLoss);
        const reward = riskDist * rr;
        const takeProfit =
            direction === TradeDirection.BUY ? entryPrice + reward : entryPrice - reward;
        return { stopLoss, takeProfit };
    }

    if (mode === 'percent') {
        const slPct = risk.slPercent ?? 0.01;
        const tpPct = risk.tpPercent ?? 0.02;
        const stopLoss =
            direction === TradeDirection.BUY
                ? entryPrice * (1 - slPct)
                : entryPrice * (1 + slPct);
        const takeProfit =
            direction === TradeDirection.BUY
                ? entryPrice * (1 + tpPct)
                : entryPrice * (1 - tpPct);
        return { stopLoss, takeProfit };
    }

    if (mode === 'fixed') {
        const slD = risk.slDistance ?? 0;
        const tpD = risk.tpDistance ?? 0;
        const stopLoss =
            direction === TradeDirection.BUY ? entryPrice - slD : entryPrice + slD;
        const takeProfit =
            direction === TradeDirection.BUY ? entryPrice + tpD : entryPrice - tpD;
        return { stopLoss, takeProfit };
    }

    // Unknown mode — fall back to candle mode
    return computeRiskLevels(entryPrice, direction, candle, { mode: 'candle', rrRatio: 2 });
}
