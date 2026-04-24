// src/components/market-chart/symbolSearchTags.ts
import { SYMBOL_CATEGORIES } from '../../data/symbolCategories';

/**
 * Extract the base asset from a Binance symbol.
 * BTCUSDT    -> BTC
 * BTCUSDT.P  -> BTC
 * ETHBTC     -> ETH
 * ETH/USDT   -> ETH
 * Falls back to the whole symbol if no known quote is detected.
 */
export const extractBaseAsset = (symbol: string): string => {
    const cleaned = symbol.replace('/', '').replace('.P', '').toUpperCase();
    const quotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'BTC', 'ETH', 'BNB'];
    for (const q of quotes) {
        if (cleaned.endsWith(q) && cleaned.length > q.length) {
            return cleaned.slice(0, -q.length);
        }
    }
    return cleaned;
};

/**
 * Derive display tags for a symbol row in the Symbol Search modal.
 * Always returns at least one tag ("spot" or "perp", and "crypto").
 * Adds a category tag if the base asset is in SYMBOL_CATEGORIES.
 */
export const deriveTags = (symbol: string): string[] => {
    const tags: string[] = [];
    tags.push(symbol.endsWith('.P') ? 'perp' : 'spot');
    tags.push('crypto');

    const base = extractBaseAsset(symbol);
    const category = SYMBOL_CATEGORIES[base];
    if (category) tags.push(category);

    return tags;
};
