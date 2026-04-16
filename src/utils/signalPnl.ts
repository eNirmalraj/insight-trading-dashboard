import { Signal, SignalStatus, TradeDirection } from '../types';

export interface PnlInfo {
    pct: number | null;
    ratio: number;
}

export function computeSignalPnl(signal: Signal, currentPrice: number | undefined): PnlInfo {
    const isBuy = signal.direction === TradeDirection.BUY;
    const entry = signal.entry;

    if (signal.status === SignalStatus.CLOSED) {
        // Use closePrice to compute actual % P&L (profitLoss is absolute dollars, not %)
        const closePrice = (signal as any).closePrice ?? (signal as any).close_price;
        if (typeof closePrice === 'number' && !Number.isNaN(closePrice) && entry > 0) {
            const pct = isBuy
                ? ((closePrice - entry) / entry) * 100
                : ((entry - closePrice) / entry) * 100;

            let ratio = 0;
            if (pct >= 0) {
                const tpDistance = Math.abs(signal.takeProfit - entry);
                const priceDistance = Math.abs(closePrice - entry);
                ratio = tpDistance > 0 ? Math.min(1, priceDistance / tpDistance) : 0;
            } else {
                const slDistance = Math.abs(signal.stopLoss - entry);
                const priceDistance = Math.abs(closePrice - entry);
                ratio = slDistance > 0 ? -Math.min(1, priceDistance / slDistance) : 0;
            }
            return { pct, ratio };
        }
        return { pct: null, ratio: 0 };
    }

    if (currentPrice === undefined || currentPrice === null || Number.isNaN(currentPrice)) {
        return { pct: null, ratio: 0 };
    }

    const pct = isBuy
        ? ((currentPrice - entry) / entry) * 100
        : ((entry - currentPrice) / entry) * 100;

    let ratio = 0;
    if (pct >= 0) {
        const tpDistance = Math.abs(signal.takeProfit - entry);
        const priceDistance = Math.abs(currentPrice - entry);
        ratio = tpDistance > 0 ? Math.min(1, priceDistance / tpDistance) : 0;
    } else {
        const slDistance = Math.abs(signal.stopLoss - entry);
        const priceDistance = Math.abs(currentPrice - entry);
        ratio = slDistance > 0 ? -Math.min(1, priceDistance / slDistance) : 0;
    }

    return { pct, ratio };
}
