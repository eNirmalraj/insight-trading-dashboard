// backend/server/src/engine/brokerAdapters/types.ts

export interface BrokerCredentials {
    id: string;
    userId: string;
    broker: string;
    apiKey: string;
    apiSecret: string;
}

export interface BracketInput {
    symbol: string;
    side: 'BUY' | 'SELL';
    qty: number;
    entryType: 'MARKET' | 'LIMIT';
    entryPrice?: number;
    stopLoss: number;
    takeProfit: number;
    reduceOnly?: boolean;
}

export type BrokerOrderRole = 'ENTRY' | 'SL' | 'TP';
export type BrokerOrderStatus = 'Pending' | 'Open' | 'Filled' | 'Cancelled' | 'Rejected';
export type BrokerOrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';

export interface BrokerOrderLeg {
    brokerOrderId: string | null;
    role: BrokerOrderRole;
    type: BrokerOrderType;
    status: BrokerOrderStatus;
    price: number | null;
    stopPrice: number | null;
    qty: number;
    rejectedReason?: string;
}

export interface BracketResult {
    legs: BrokerOrderLeg[];
    rejectedReason?: string;
}

export interface FillEvent {
    brokerOrderId: string;
    symbol: string;
    fillQty: number;
    fillPrice: number;
    isMaker: boolean;
    commission: number;
    commissionAsset: string;
    raw: unknown;
}

export interface BrokerPosition {
    symbol: string;
    qty: number;
    avgEntryPrice: number;
    unrealizedPnl: number;
}

export interface BrokerAdapter {
    submitBracket(input: BracketInput, creds: BrokerCredentials | null): Promise<BracketResult>;
    cancelOrder(brokerOrderId: string, symbol: string, creds: BrokerCredentials | null): Promise<void>;
    getOpenOrders(symbol: string, creds: BrokerCredentials | null): Promise<BrokerOrderLeg[]>;
    getPosition(symbol: string, creds: BrokerCredentials | null): Promise<BrokerPosition | null>;
    subscribeFills(creds: BrokerCredentials | null, onFill: (fill: FillEvent) => void): () => void;
    ping(creds: BrokerCredentials | null): Promise<boolean>;
}
