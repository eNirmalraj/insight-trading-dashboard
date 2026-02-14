// Fix: Removed incorrect import of SignalStatus and TradeDirection which caused a circular dependency.
// Fix: Removed incorrect import of `Candle` to break a circular dependency. The `Candle` type will be imported from its new home in `components/market-chart/types.ts`.


export enum SignalStatus {
  ACTIVE = 'Active',
  CLOSED = 'Closed',
  PENDING = 'Pending',
}

export enum TradeDirection {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum EntryType {
  MARKET = 'Market',
  LIMIT = 'Limit',
  STOP = 'Stop',
}

export enum StrategyCategory {
  TREND_FOLLOWING = 'Trend Following',
  MEAN_REVERSION = 'Mean Reversion',
  VOLATILITY_BREAKOUT = 'Volatility Breakout',
  MOMENTUM = 'Momentum',
  BREAKOUT = 'Breakout',
}

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D';


export interface Signal {
  id: string;
  pair: string;
  strategy: string;
  strategyCategory?: StrategyCategory; // Made optional to avoid schema cache issues
  strategyId?: string; // FK to strategies table
  direction: TradeDirection;
  entry: number;
  entryType: EntryType;
  stopLoss: number;
  takeProfit: number;
  status: SignalStatus;
  timestamp: string;
  timeframe: Timeframe;
  chartData?: any[]; // Using any to avoid circular dependency with Candle
  closeReason?: 'TP' | 'SL' | 'MANUAL' | 'TIMEOUT';
  profitLoss?: number;
  isPinned?: boolean;
  activatedAt?: string;
  closedAt?: string;
  trailingStopLoss?: number;
  lotSize?: number;
  leverage?: number;
}

export interface Metric {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
}

export enum AlertStatus {
  TRIGGERED = 'Triggered',
  LIVE = 'Live',
}

export interface Alert {
  id: string;
  message: string;
  timestamp: string;
  status: AlertStatus;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  isPositive: boolean;
  autoTradeEnabled?: boolean;
  pnl?: number;
  // Risk Management Settings
  lot_size?: number;
  risk_percent?: number;
  take_profit_distance?: number;
  stop_loss_distance?: number;
  trailing_stop_loss_distance?: number;
  leverage?: number;
}

export enum AccountType {
  FOREX = 'Forex',
  CRYPTO = 'Crypto',
  INDIAN = 'Indian'
}

export interface Watchlist {
  id: string;
  name: string;
  accountType: AccountType | 'Forex' | 'Crypto' | 'Indian'; // Allow string for backward compatibility during migration
  strategyType?: string;
  tradingMode?: 'paper' | 'live'; // Added tradingMode
  items: WatchlistItem[];
  isMasterAutoTradeEnabled?: boolean;
  // Risk Management Settings (Global)
  lotSize?: number;
  riskPercent?: number;
  takeProfitDistance?: number;
  stopLossDistance?: number;
  trailingStopLossDistance?: number;
  leverage?: number;
  executionTimeframes?: string[];
  manualRiskEnabled?: boolean;
  marketType?: 'spot' | 'futures';
  riskMethod?: 'fixed' | 'percent';
  autoLeverageEnabled?: boolean;
}

export enum PositionStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  CLOSED = 'CLOSED',
}

export interface Position {
  id: string;
  symbol: string;
  account: 'Forex' | 'Binance' | 'Paper';
  direction: TradeDirection;
  quantity: number; // Lots for Forex, amount for Binance
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  status: PositionStatus;
  openTime: string;
  closeTime?: string;
  leverage?: number;
  marketType?: 'spot' | 'futures';
}

export interface RecentTrade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  pnl: number;
  timestamp: string;
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
}

export interface UpcomingInfo {
  id: string;
  type: 'Live Class' | 'Market Briefing';
  title: string;
  description: string;
  date: string;
  imageUrl: string;
}

export interface FeatureMetric {
  'Avg Win': string;
  'Avg Loss': string;
  'Max Drawdown': string;
  'Profit Factor': string;
  [key: string]: string; // Allow flexible keys
}

export interface ChartDataPoint {
  time: string;
  value: number;
}

export interface DailyTradeSummary {
  date: string;
  trades: number;
  pnl: number;
  winRate?: number;
}

export interface StrategyIndicatorConfig {
  type: string; // 'MA', 'EMA', 'RSI', etc.
  parameters: {
    period?: number;
    [key: string]: any; // flexible for different indicators
  };
}

export interface StrategyEntryRule {
  condition: 'crossover' | 'crossunder' | 'greater_than' | 'less_than';
  indicator1: string; // e.g. "MA_20"
  indicator2?: string; // optional second indicator
  value?: number; // for threshold comparisons
  direction: TradeDirection; // 'BUY' or 'SELL'
}

export interface Strategy {
  id: string;
  name: string;
  description?: string;
  category?: StrategyCategory;
  tradingMode?: 'paper' | 'live'; // Added tradingMode
  timeframe: string;
  symbolScope: string[];
  entryRules: StrategyEntryRule[]; // Typed entry rules
  exitRules: any[];
  indicators: StrategyIndicatorConfig[]; // Typed indicators
  isActive: boolean;
  parameters?: StrategyParameter[];
  type: 'STRATEGY' | 'INDICATOR' | 'KURI';
  content?: any; // Full JSON content for accurate persistence
  kuriScript?: string; // Kuri language script content
}

export interface StrategyParameter {
  id: string;
  strategyId?: string;
  name: string;
  value: string;
  type: 'number' | 'string' | 'boolean';
}
