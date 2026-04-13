// backend/server/src/services/platformSignals.ts
// Platform-wide signal stream definition: 10 hardcoded symbols running
// SMA Trend with default params. The Signal Engine treats these as synthetic
// watchlist assignments with user_id=null.
//
// Executions produced by this stream are visible to users who have no
// watchlists (filtered on the frontend).

import { Market } from '../constants/enums';

export interface PlatformAssignment {
    strategyId: string;              // string id like 'builtin-sma-trend' — loader maps to uuid
    symbols: string[];               // canonical Binance-native, e.g. 'BTCUSDT'
    market: Market;
    timeframe: string;
    params: Record<string, any>;
}

export const PLATFORM_ASSIGNMENTS: PlatformAssignment[] = [
    {
        strategyId: 'builtin-sma-trend',
        symbols: [
            'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
            'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'AVAXUSDT', 'LINKUSDT',
        ],
        market: Market.FUTURES,
        timeframe: '1H',
        params: {}, // empty = use script defaults (fastLen=20, slowLen=50)
    },
];
