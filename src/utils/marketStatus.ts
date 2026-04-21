export type MarketState = 'open' | 'closed' | 'pre-market' | 'after-hours';
export type AssetClass = 'crypto' | 'us-stock' | 'forex' | 'futures' | 'unknown';

export interface MarketStatus {
    state: MarketState;
    label: string;
}

/**
 * Classify a symbol into an asset class by string pattern. Crypto detection
 * relies on USDT/USDC/BTC/ETH suffixes or the Binance ".P" perpetual suffix.
 * US stocks are 1–5 uppercase letters with no suffix. Forex is 6 letters
 * (e.g., USDEUR, GBPJPY). Everything else is "unknown".
 */
export function classifyAsset(symbol: string): AssetClass {
    if (/USDT?$|USDC?$|BTC$|ETH$/.test(symbol) || /\.[A-Z]+$/.test(symbol)) return 'crypto';
    if (/^[A-Z]{1,5}$/.test(symbol)) return 'us-stock';
    if (/^[A-Z]{6}$/.test(symbol)) return 'forex';
    return 'unknown';
}

export function getMarketStatus(symbol: string, now: Date = new Date()): MarketStatus {
    const cls = classifyAsset(symbol);
    switch (cls) {
        case 'crypto':
            return { state: 'open', label: 'Live' };
        case 'us-stock':
            return getUsStockStatus(now);
        case 'forex':
            return getForexStatus(now);
        case 'futures':
            return getFuturesStatus(now);
        case 'unknown':
            return { state: 'open', label: 'Live' };
    }
}

function getUsStockStatus(now: Date): MarketStatus {
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay();
    if (dow === 0 || dow === 6) return { state: 'closed', label: 'Closed' };
    const minutes = et.getHours() * 60 + et.getMinutes();
    const PRE_OPEN = 4 * 60;
    const REG_OPEN = 9 * 60 + 30;
    const REG_CLOSE = 16 * 60;
    const POST_CLOSE = 20 * 60;
    if (minutes >= REG_OPEN && minutes < REG_CLOSE) return { state: 'open', label: 'Open' };
    if (minutes >= PRE_OPEN && minutes < REG_OPEN) return { state: 'pre-market', label: 'Pre-market' };
    if (minutes >= REG_CLOSE && minutes < POST_CLOSE) return { state: 'after-hours', label: 'After-hours' };
    return { state: 'closed', label: 'Closed' };
}

function getForexStatus(now: Date): MarketStatus {
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dow = et.getDay();
    const minutes = et.getHours() * 60 + et.getMinutes();
    const FRI_CLOSE = 17 * 60;
    const SUN_OPEN = 17 * 60;
    if (dow === 6) return { state: 'closed', label: 'Closed' };
    if (dow === 0 && minutes < SUN_OPEN) return { state: 'closed', label: 'Closed' };
    if (dow === 5 && minutes >= FRI_CLOSE) return { state: 'closed', label: 'Closed' };
    return { state: 'open', label: 'Live' };
}

function getFuturesStatus(now: Date): MarketStatus {
    // Simplified: Globex 24h Sun 18:00 ET → Fri 17:00 ET
    return getForexStatus(now);
}

export function marketStatusDotColor(state: MarketState): string {
    switch (state) {
        case 'open':
            return 'bg-green-500';
        case 'closed':
            return 'bg-red-500';
        case 'pre-market':
        case 'after-hours':
            return 'bg-yellow-500';
    }
}
