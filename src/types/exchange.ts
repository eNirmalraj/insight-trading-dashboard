
export interface ExchangeKey {
    id: string;
    user_id: string;
    exchange: 'binance' | 'coinbase' | 'kraken';
    nickname: string;
    api_key: string; // Will likely be masked in UI
    api_secret?: string; // Often not returned after creation for security, or masked
    is_active: boolean;
    created_at: string;
}

export interface CreateExchangeKeyPayload {
    exchange: 'binance' | 'coinbase' | 'kraken';
    nickname: string;
    api_key: string;
    api_secret: string;
}
