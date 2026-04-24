// src/data/symbolCategories.ts
// Base-asset → category tag map for the Symbol Search modal. Curated; edit freely.
// Key is the uppercase base asset (e.g. "BTC", "ETH"). Value is a single lowercase tag.

export const SYMBOL_CATEGORIES: Record<string, string> = {
    // Layer-1 blockchains
    BTC: 'layer1',
    ETH: 'layer1',
    SOL: 'layer1',
    AVAX: 'layer1',
    ADA: 'layer1',
    DOT: 'layer1',
    ATOM: 'layer1',
    NEAR: 'layer1',
    APT: 'layer1',
    SUI: 'layer1',
    TON: 'layer1',
    TRX: 'layer1',

    // DeFi blue chips
    UNI: 'defi',
    AAVE: 'defi',
    MKR: 'defi',
    COMP: 'defi',
    CRV: 'defi',
    SNX: 'defi',
    LDO: 'defi',

    // Stablecoins
    USDT: 'stablecoin',
    USDC: 'stablecoin',
    DAI: 'stablecoin',
    BUSD: 'stablecoin',
    TUSD: 'stablecoin',
    FDUSD: 'stablecoin',

    // Memes
    DOGE: 'meme',
    SHIB: 'meme',
    PEPE: 'meme',
    WIF: 'meme',
    BONK: 'meme',
    FLOKI: 'meme',

    // Layer-2 / scaling
    MATIC: 'layer2',
    ARB: 'layer2',
    OP: 'layer2',
    IMX: 'layer2',
    STRK: 'layer2',
};
