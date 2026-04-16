// --- Supported exchanges ---
export type ExchangeName = 'binance' | 'bitget';

export const EXCHANGES: {
    id: ExchangeName;
    name: string;
    color: string;
    logo: string;
    description: string;
    features: string[];
    apiKeyGuideUrl: string;
    ipWhitelistRequired: boolean;
    fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
}[] = [
    {
        id: 'binance',
        name: 'Binance',
        color: '#F0B90B',
        logo: 'BN',
        description: 'World\'s largest crypto exchange by volume. Supports spot, margin, and futures trading.',
        features: ['Spot', 'Futures', 'Margin'],
        apiKeyGuideUrl: 'https://www.binance.com/en/support/faq/detail/360002502072',
        ipWhitelistRequired: false,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Enter your Binance API key' },
            { key: 'api_secret', label: 'API Secret', placeholder: 'Enter your Binance API secret', secret: true },
        ],
    },
    {
        id: 'bitget',
        name: 'Bitget',
        color: '#00D4AA',
        logo: 'BG',
        description: 'Top crypto derivatives exchange with copy trading. Supports spot and futures.',
        features: ['Spot', 'Futures', 'Copy Trading'],
        apiKeyGuideUrl: 'https://www.bitget.com/academy/how-to-create-api',
        ipWhitelistRequired: false,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Enter your Bitget API key' },
            { key: 'api_secret', label: 'API Secret', placeholder: 'Enter your Bitget API secret', secret: true },
            { key: 'passphrase', label: 'Passphrase', placeholder: 'Enter your Bitget API passphrase', secret: true },
        ],
    },
];

// --- Exchange connection row ---
export interface ExchangeKey {
    id: string;
    user_id: string;
    exchange: ExchangeName;
    nickname: string;
    api_key: string;
    api_secret?: string;
    passphrase?: string;
    is_active: boolean;
    environment: 'live' | 'testnet';
    permissions: string[];
    last_tested_at: string | null;
    last_test_status: 'success' | 'failed' | null;
    created_at: string;
}

export interface CreateExchangeKeyPayload {
    exchange: ExchangeName;
    nickname: string;
    api_key: string;
    api_secret: string;
    passphrase?: string;
    environment: 'live' | 'testnet';
}
