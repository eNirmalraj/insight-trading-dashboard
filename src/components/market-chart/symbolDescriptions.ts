const SYMBOL_DESCRIPTIONS: Record<string, string> = {
    BTCUSDT: 'Bitcoin / Tether USD',
    ETHUSDT: 'Ethereum / Tether USD',
    BNBUSDT: 'BNB / Tether USD',
    SOLUSDT: 'Solana / Tether USD',
    XRPUSDT: 'XRP / Tether USD',
    ADAUSDT: 'Cardano / Tether USD',
    DOGEUSDT: 'Dogecoin / Tether USD',
    AVAXUSDT: 'Avalanche / Tether USD',
    DOTUSDT: 'Polkadot / Tether USD',
    MATICUSDT: 'Polygon / Tether USD',
    LTCUSDT: 'Litecoin / Tether USD',
    LINKUSDT: 'Chainlink / Tether USD',
    TRXUSDT: 'TRON / Tether USD',
    NEARUSDT: 'NEAR Protocol / Tether USD',
    UNIUSDT: 'Uniswap / Tether USD',
};

/**
 * Look up a human-readable description for a Binance trading pair.
 * Strips Binance Futures suffixes like ".P" before the lookup so
 * "BTCUSDT.P" returns the same description as "BTCUSDT".
 * Returns null when the symbol isn't in the static dictionary.
 */
export function getSymbolDescription(symbol: string): string | null {
    const base = symbol.replace(/\.[A-Z]+$/, '');
    return SYMBOL_DESCRIPTIONS[base] ?? null;
}
