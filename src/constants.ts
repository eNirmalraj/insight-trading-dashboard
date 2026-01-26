
import { Candle } from './components/market-chart/types';
import { Metric, Watchlist, Alert, AlertStatus, SignalStatus, TradeDirection, EntryType, StrategyCategory, Signal, Position, PositionStatus, UpcomingInfo, Suggestion } from './types';

// This function is needed for the mock API to generate chart data
export const generateCandlestickData = (basePrice = 1.0850, numCandles = 200): Candle[] => {
    const data: Candle[] = [];
    let lastClose = basePrice;
    const startTime = Math.floor(Date.now() / 1000) - numCandles * 900; // 15m candles

    for (let i = 0; i < numCandles; i++) {
        const open = lastClose;
        const close = open + (Math.random() - 0.5) * 0.001;
        const high = Math.max(open, close) + Math.random() * 0.0005;
        const low = Math.min(open, close) - Math.random() * 0.0005;
        const volume = Math.random() * 1000 + 500;

        data.push({
            time: startTime + i * 900,
            open,
            high,
            low,
            close,
            volume
        });
        lastClose = close;
    }
    return data;
};


export const DUMMY_FOREX_METRICS: Metric[] = [
    { title: 'Balance', value: '$10,530.52', change: '+1.2%', isPositive: true },
    { title: 'Equity', value: '$11,250.80', change: '+2.5%', isPositive: true },
    { title: 'Open P/L', value: '$720.28', change: '', isPositive: true },
    { title: 'Win Rate', value: '68%', change: '-0.5%', isPositive: false },
];

export const DUMMY_BINANCE_METRICS: Metric[] = [
    { title: 'Balance (USDT)', value: '25,830.10', change: '+5.8%', isPositive: true },
    { title: 'Open P/L (USDT)', value: '1,500.45', change: '', isPositive: true },
    { title: 'Today\'s P/L', value: '$850.00', change: '+3.4%', isPositive: true },
    { title: '24h Volume', value: '1.2M USDT', change: '', isPositive: true },
];

export const DUMMY_PERFORMANCE_DATA = Array.from({ length: 30 }, (_, i) => ({
    date: `Day ${i + 1}`,
    balance: 10000 + i * 150 + Math.random() * 600 - 300,
}));

export const DUMMY_UPCOMING_INFO: UpcomingInfo[] = [
    { id: '1', type: 'Live Class', title: 'Advanced Fibonacci Techniques', description: 'Master retracements and extensions with our head analyst.', date: 'Oct 28, 7:00 PM', imageUrl: 'https://picsum.photos/seed/fibonacci/400/200' },
    { id: '2', type: 'Market Briefing', title: 'Weekly Forex Outlook', description: 'Key levels and events to watch for the upcoming week.', date: 'Oct 30, 9:00 AM', imageUrl: 'https://picsum.photos/seed/forex/400/200' },
    { id: '3', type: 'Live Class', title: 'Crypto Market Psychology', description: 'Understand the fear and greed index and how to use it.', date: 'Nov 2, 6:00 PM', imageUrl: 'https://picsum.photos/seed/crypto/400/200' }
];

export const DUMMY_SUGGESTIONS: Suggestion[] = [
    { id: 's1', title: 'Review GBP/JPY Chart', description: 'A potential reversal pattern is forming on the 4H chart. Consider analyzing for a short entry.' },
    { id: 's2', title: 'Set Alert for BTC/USDT', description: 'Bitcoin is approaching a key resistance level at $70,000. Set a price alert to be notified of a breakout.' },
    { id: 's3', title: 'Check Your Risk Exposure', description: 'Your current open positions have a high correlation. Consider reducing exposure on correlated pairs.' },
];

export const DUMMY_SIGNALS: Signal[] = [
    { id: 'sig1', pair: 'EUR/USD', strategy: 'MA Crossover', strategyCategory: StrategyCategory.TREND_FOLLOWING, direction: TradeDirection.BUY, entry: 1.0850, entryType: EntryType.MARKET, stopLoss: 1.0820, takeProfit: 1.0910, status: SignalStatus.ACTIVE, timestamp: new Date(Date.now() - 3600000).toISOString(), timeframe: '1H', chartData: generateCandlestickData(1.0850, 60) },
    { id: 'sig2', pair: 'BTC/USDT', strategy: 'RSI Divergence', strategyCategory: StrategyCategory.MEAN_REVERSION, direction: TradeDirection.SELL, entry: 69500, entryType: EntryType.LIMIT, stopLoss: 70500, takeProfit: 67000, status: SignalStatus.PENDING, timestamp: new Date(Date.now() - 7200000).toISOString(), timeframe: '4H', chartData: generateCandlestickData(69500, 60) },
    { id: 'sig3', pair: 'GBP/JPY', strategy: 'Momentum Breakout', strategyCategory: StrategyCategory.VOLATILITY_BREAKOUT, direction: TradeDirection.BUY, entry: 195.50, entryType: EntryType.STOP, stopLoss: 195.00, takeProfit: 196.50, status: SignalStatus.CLOSED, timestamp: new Date(Date.now() - 86400000).toISOString(), timeframe: '15m', chartData: generateCandlestickData(195.50, 60) },
];

export const DUMMY_WATCHLISTS: Watchlist[] = [
    {
        id: 'wl1', name: 'Majors', accountType: 'Forex', strategyType: 'MA Crossover', isMasterAutoTradeEnabled: true, items: [
            { id: 'wli1', symbol: 'EUR/USD', price: 1.0855, change: 0.0030, changePercent: 0.28, isPositive: true, autoTradeEnabled: true, pnl: 150.25 },
            { id: 'wli2', symbol: 'GBP/USD', price: 1.2540, change: -0.0015, changePercent: -0.12, isPositive: false, autoTradeEnabled: false, pnl: -50.10 },
            { id: 'wli3', symbol: 'USD/JPY', price: 155.80, change: 0.50, changePercent: 0.32, isPositive: true, autoTradeEnabled: true, pnl: 220.00 },
        ]
    },
    {
        id: 'wl2', name: 'Crypto Top Tier', accountType: 'Crypto', strategyType: 'RSI Divergence', isMasterAutoTradeEnabled: false, items: [
            { id: 'wli4', symbol: 'BTC/USDT', price: 68500.00, change: 1200.00, changePercent: 1.78, isPositive: true, autoTradeEnabled: false },
            { id: 'wli5', symbol: 'ETH/USDT', price: 3800.00, change: -50.00, changePercent: -1.30, isPositive: false, autoTradeEnabled: false, pnl: -120.00 },
        ]
    },
    {
        id: 'wl3', name: 'METAL, ENERGY & OIL', accountType: 'Forex', items: [
            { id: 'wli6', symbol: 'BCOUSD', price: 82.50, change: 1.20, changePercent: 1.47, isPositive: true },
            { id: 'wli7', symbol: 'NGT1!', price: 2.85, change: -0.05, changePercent: -1.72, isPositive: false },
            { id: 'wli8', symbol: 'XAGUSD', price: 28.50, change: 0.35, changePercent: 1.24, isPositive: true },
            { id: 'wli9', symbol: 'XAUUSD', price: 2345.67, change: -10.25, changePercent: -0.44, isPositive: false },
            { id: 'wli10', symbol: 'XPTUSD', price: 1050.00, change: 15.00, changePercent: 1.45, isPositive: true },
            { id: 'wli17', symbol: 'XAUINRx', price: 6200.00, change: 50, changePercent: 0.81, isPositive: true },
        ]
    },
    {
        id: 'wl4', name: 'VJ', accountType: 'Forex', items: [
            { id: 'wli11', symbol: 'AUD/CAD', price: 0.9123, change: 0.0012, changePercent: 0.13, isPositive: true },
            { id: 'wli12', symbol: 'EUR/USD', price: 1.0855, change: 0.0030, changePercent: 0.28, isPositive: true },
            { id: 'wli13', symbol: 'GBP/CAD', price: 1.7345, change: -0.0021, changePercent: -0.12, isPositive: false },
            { id: 'wli14', symbol: 'GBP/CHF', price: 1.1456, change: 0.0005, changePercent: 0.04, isPositive: true },
            { id: 'wli15', symbol: 'NZD/USD', price: 0.6140, change: 0.0015, changePercent: 0.24, isPositive: true },
            { id: 'wli16', symbol: 'XAU/USD', price: 2345.67, change: -10.25, changePercent: -0.44, isPositive: false },
        ]
    },
];

export const DUMMY_SCRIPTS: Watchlist[] = [
    {
        id: 'sc1', name: 'Momentum Bot', accountType: 'Forex', strategyType: 'Momentum Breakout', isMasterAutoTradeEnabled: true, items: [
            { id: 'sci1', symbol: 'EUR/USD', price: 1.0855, change: 0.0030, changePercent: 0.28, isPositive: true, autoTradeEnabled: true, pnl: 150.25 },
            { id: 'sci2', symbol: 'GBP/JPY', price: 195.20, change: 0.5, changePercent: 0.25, isPositive: true, autoTradeEnabled: true, pnl: 80.00 },
        ]
    },
    {
        id: 'sc2', name: 'Scalping Algo', accountType: 'Crypto', strategyType: 'Mean Reversion', isMasterAutoTradeEnabled: false, items: [
            { id: 'sci3', symbol: 'BTC/USDT', price: 68500.00, change: 1200.00, changePercent: 1.78, isPositive: true, autoTradeEnabled: false },
            { id: 'sci4', symbol: 'SOL/USDT', price: 145.00, change: -2.00, changePercent: -1.36, isPositive: false, autoTradeEnabled: false },
        ]
    },
    {
        id: 'sc3', name: 'Trend Following', accountType: 'Forex', strategyType: 'MA Crossover', isMasterAutoTradeEnabled: true, items: [
            { id: 'sci5', symbol: 'USD/JPY', price: 155.80, change: 0.50, changePercent: 0.32, isPositive: true, autoTradeEnabled: true },
        ]
    },
];

export const DUMMY_POSITIONS: Position[] = [
    { id: 'pos1', symbol: 'EUR/USD', account: 'Forex', direction: TradeDirection.BUY, quantity: 0.5, entryPrice: 1.0830, stopLoss: 1.0800, takeProfit: 1.0900, pnl: 125.50, status: PositionStatus.OPEN, openTime: new Date(Date.now() - 4 * 3600000).toISOString() },
    { id: 'pos2', symbol: 'BTC/USDT', account: 'Binance', direction: TradeDirection.SELL, quantity: 0.02, entryPrice: 69000, stopLoss: 70000, takeProfit: 67000, pnl: 100.00, status: PositionStatus.OPEN, openTime: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: 'pos3', symbol: 'USD/JPY', account: 'Forex', direction: TradeDirection.BUY, quantity: 1.0, entryPrice: 155.20, stopLoss: 154.80, takeProfit: 156.00, pnl: 0, status: PositionStatus.PENDING, openTime: new Date().toISOString() },
    { id: 'pos4', symbol: 'ETH/USDT', account: 'Binance', direction: TradeDirection.BUY, quantity: 0.1, entryPrice: 3850, stopLoss: 3750, takeProfit: 4000, pnl: -150.00, status: PositionStatus.CLOSED, openTime: new Date(Date.now() - 2 * 86400000).toISOString(), closeTime: new Date(Date.now() - 86400000).toISOString() },
];

export const DUMMY_ALERTS: Alert[] = [
    { id: 'al1', message: 'GBP/JPY price crossed up 185.50', timestamp: new Date(Date.now() - 3600000).toISOString(), status: AlertStatus.TRIGGERED },
    { id: 'al2', message: 'BTC/USDT price less than 68000', timestamp: new Date().toISOString(), status: AlertStatus.LIVE },
    { id: 'al3', message: 'EUR/USD price crossed 1.0800', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), status: AlertStatus.TRIGGERED },
];

export const DUMMY_EDUCATION_CONTENT = {
    classes: [
        { title: 'Mastering Market Structure', description: 'Learn to identify trends, ranges, and key levels.', type: 'Live Class', imageUrl: 'https://picsum.photos/seed/class1/400/200' },
        { title: 'Advanced Risk Management', description: 'Protect your capital and optimize position sizing.', type: 'Live Class', imageUrl: 'https://picsum.photos/seed/class2/400/200' },
    ],
    books: [
        { title: 'Trading in the Zone', description: 'by Mark Douglas - A classic on trading psychology.', type: 'Book', imageUrl: 'https://picsum.photos/seed/book1/400/200' },
    ],
    videos: [
        { title: 'Introduction to Candlesticks', description: 'A beginner\'s guide to reading price action.', type: 'Video Course', imageUrl: 'https://picsum.photos/seed/video1/400/200' },
    ],
};

export const DUMMY_DETAILED_METRICS_FOREX = { 'Avg Win': '$55.20', 'Avg Loss': '-$30.10', 'Max Drawdown': '5.2%', 'Profit Factor': '1.83' };
export const DUMMY_DETAILED_METRICS_BINANCE = { 'Avg Win': '$120.50', 'Avg Loss': '-$75.00', 'Max Drawdown': '8.1%', 'Profit Factor': '1.61' };

export const DUMMY_BALANCE_HISTORY_FOREX = Array.from({ length: 30 }, (_, i) => ({ date: `Day ${i}`, balance: 10000 + i * 50 + (Math.random() - 0.5) * 400 }));
export const DUMMY_BALANCE_HISTORY_BINANCE = Array.from({ length: 30 }, (_, i) => ({ date: `Day ${i}`, balance: 20000 + i * 200 + (Math.random() - 0.5) * 1000 }));

export const DUMMY_TRADE_HISTORY: DailyTradeSummary[] = Array.from({ length: 50 }, (_, i) => {
    const d = new Date('2025-09-13T12:00:00Z');
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) return null; // No trades on weekends
    return {
        date: d.toISOString().split('T')[0],
        pnl: (Math.random() - 0.4) * 200,
        trades: Math.floor(Math.random() * 5) + 1,
    };
}).filter(Boolean) as DailyTradeSummary[];

export const DUMMY_STRATEGY_PERFORMANCE = {}; // No complex data needed for now

export const AVAILABLE_STRATEGIES = ['No Strategy', 'Momentum Breakout', 'RSI Divergence', 'MA Crossover', 'SMA Trend Strategy', 'EMA Trend Strategy'];

export const BUILTIN_STRATEGY_NAMES = [
    'SMA Trend Strategy',
    'EMA Trend Strategy'
];

// The types below are exported for use in components that previously consumed dummy data.
// In a real application, these might be defined in a shared types file.
export interface PerformanceData {
    date: string;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
    profitFactor: number;
    sharpeRatio: number;
    winRate: number;
    trades: number;
}
export interface BalanceHistoryData {
    date: string;
    balance: number;
}
export interface DailyTradeSummary {
    date: string; // YYYY-MM-DD
    pnl: number;
    trades: number;
}
