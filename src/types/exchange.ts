// --- Supported exchanges ---
export type ExchangeName =
    | 'binance'
    | 'bitget'
    | 'mt5'
    | 'zerodha'
    | 'angelone'
    | 'upstox'
    | 'dhan'
    | 'fyers';

export type ExchangeCategory = 'crypto' | 'forex' | 'indian';

export const EXCHANGES: {
    id: ExchangeName;
    name: string;
    color: string;
    logo: string;
    category: ExchangeCategory;
    description: string;
    features: string[];
    apiKeyGuideUrl: string;
    ipWhitelistRequired: boolean;
    oauth?: boolean; // true if this broker uses OAuth flow instead of manual key paste
    fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
    setupSteps: string[];
}[] = [
    // ── Crypto ──────────────────────────────────────────
    {
        id: 'binance',
        name: 'Binance',
        color: '#F0B90B',
        logo: 'BN',
        category: 'crypto',
        description: 'World\'s largest crypto exchange by volume. Supports spot, margin, and futures trading.',
        features: ['Spot', 'Futures', 'Margin'],
        apiKeyGuideUrl: 'https://www.binance.com/en/support/faq/detail/360002502072',
        ipWhitelistRequired: false,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Enter your Binance API key' },
            { key: 'api_secret', label: 'API Secret', placeholder: 'Enter your Binance API secret', secret: true },
        ],
        setupSteps: [
            'Log in to Binance and go to **API Management**',
            'Click **"Create API"** and complete 2FA verification',
            'Enable **"Enable Spot & Margin Trading"** and **"Enable Futures"**',
            '**IMPORTANT: Keep "Enable Withdrawals" DISABLED** — Insight never needs withdrawal access',
            'Copy the **API Key** and **Secret Key**',
        ],
    },
    {
        id: 'bitget',
        name: 'Bitget',
        color: '#00D4AA',
        logo: 'BG',
        category: 'crypto',
        description: 'Top crypto derivatives exchange with copy trading. Supports spot and futures.',
        features: ['Spot', 'Futures', 'Copy Trading'],
        apiKeyGuideUrl: 'https://www.bitget.com/academy/how-to-create-api',
        ipWhitelistRequired: false,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Enter your Bitget API key' },
            { key: 'api_secret', label: 'API Secret', placeholder: 'Enter your Bitget API secret', secret: true },
            { key: 'passphrase', label: 'Passphrase', placeholder: 'Enter your Bitget API passphrase', secret: true },
        ],
        setupSteps: [
            'Log in to Bitget and go to **API Management**',
            'Click **"Create API"** and complete 2FA verification',
            'Enable **"Enable Spot & Margin Trading"** and **"Enable Futures"**',
            'Set a **passphrase** — you\'ll need it in the next step',
            '**IMPORTANT: Keep "Enable Withdrawals" DISABLED**',
            'Copy the **API Key**, **Secret Key**, and **Passphrase**',
        ],
    },

    // ── Forex ───────────────────────────────────────────
    {
        id: 'mt5',
        name: 'MetaTrader 5',
        color: '#2962FF',
        logo: 'MT',
        category: 'forex',
        description: 'Connect any MT5 forex broker — IC Markets, Pepperstone, Exness, XM, FXCM, and more.',
        features: ['Forex', 'Indices', 'Commodities', 'CFDs'],
        apiKeyGuideUrl: 'https://www.metatrader5.com/en/terminal/help/startworking/open_an_account',
        ipWhitelistRequired: false,
        fields: [
            { key: 'mt5_login', label: 'Account Number', placeholder: 'e.g. 12345678' },
            { key: 'mt5_password', label: 'Trading Password', placeholder: 'Your MT5 trading password', secret: true },
            { key: 'mt5_server', label: 'Server Name', placeholder: 'e.g. ICMarketsSC-Demo' },
        ],
        setupSteps: [
            'Open your MT5 broker account (IC Markets, Pepperstone, Exness, XM, etc.)',
            'In your broker\'s dashboard, find your **MT5 credentials**: Account Number, Password, and Server Name',
            'Use your **trading password** (not the investor/read-only password)',
            'The **Server Name** is shown in your MT5 terminal under File → Open an Account, or in the email your broker sent',
            'Copy the **Account Number**, **Trading Password**, and **Server Name**',
        ],
    },

    // ── Indian Brokers ──────────────────────────────────
    {
        id: 'zerodha',
        name: 'Zerodha',
        color: '#387ED1',
        logo: 'ZR',
        category: 'indian',
        description: 'India\'s largest retail broker. Kite Connect API for stocks, F&O, commodities, and currencies.',
        features: ['Equity', 'F&O', 'Commodities', 'Currency'],
        apiKeyGuideUrl: 'https://kite.trade/',
        ipWhitelistRequired: false,
        oauth: true,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Your Kite Connect API key' },
            { key: 'api_secret', label: 'API Secret', placeholder: 'Your Kite Connect API secret', secret: true },
            { key: 'access_token', label: 'Access Token', placeholder: 'Generated after OAuth login', secret: true },
        ],
        setupSteps: [
            'Go to **[Kite Connect](https://kite.trade/)** and create a developer app (₹2000/month)',
            'Copy the **API Key** and **API Secret** from your app dashboard',
            'Complete the **OAuth login flow** to generate an **Access Token**',
            'The access token expires daily — you\'ll need to re-login each morning before market opens',
            'Copy the **API Key**, **API Secret**, and **Access Token**',
        ],
    },
    {
        id: 'angelone',
        name: 'Angel One',
        color: '#FF6B00',
        logo: 'AO',
        category: 'indian',
        description: 'Free SmartAPI for algo trading. Supports equity, F&O, commodities. Best free option for Indian markets.',
        features: ['Equity', 'F&O', 'Commodities', 'Free API'],
        apiKeyGuideUrl: 'https://smartapi.angelone.in/',
        ipWhitelistRequired: false,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Your SmartAPI key' },
            { key: 'client_id', label: 'Client ID', placeholder: 'Your Angel One client ID (e.g. A12345)' },
            { key: 'password', label: 'MPIN / Password', placeholder: 'Your Angel One MPIN', secret: true },
            { key: 'totp_secret', label: 'TOTP Secret', placeholder: 'Your authenticator TOTP secret key', secret: true },
        ],
        setupSteps: [
            'Go to **[SmartAPI Portal](https://smartapi.angelone.in/)** and sign up with your Angel One account',
            'Create a new app and copy the **API Key**',
            'Note your **Client ID** (shown in your Angel One dashboard, e.g. A12345)',
            'You\'ll need your **MPIN** (4-digit PIN used to log in)',
            'For auto-login, provide your **TOTP secret key** (from Google Authenticator setup — the base32 string, not the 6-digit code)',
        ],
    },
    {
        id: 'upstox',
        name: 'Upstox',
        color: '#5D35B1',
        logo: 'UP',
        category: 'indian',
        description: 'Modern trading platform with free API access. Real-time WebSocket data, equity and derivatives.',
        features: ['Equity', 'F&O', 'WebSocket', 'Free API'],
        apiKeyGuideUrl: 'https://upstox.com/developer/api-documentation/',
        ipWhitelistRequired: false,
        oauth: true,
        fields: [
            { key: 'api_key', label: 'API Key', placeholder: 'Your Upstox API key' },
            { key: 'api_secret', label: 'API Secret', placeholder: 'Your Upstox API secret', secret: true },
            { key: 'access_token', label: 'Access Token', placeholder: 'Generated after OAuth login', secret: true },
        ],
        setupSteps: [
            'Go to **[Upstox Developer Portal](https://upstox.com/developer/api-documentation/)** and create an app',
            'Copy the **API Key** and **API Secret**',
            'Set the **Redirect URL** to your Insight backend URL',
            'Complete the **OAuth login flow** to get an **Access Token**',
            'Access token expires daily — re-authenticate each morning',
        ],
    },
    {
        id: 'dhan',
        name: 'Dhan',
        color: '#00BFA5',
        logo: 'DH',
        category: 'indian',
        description: 'Fastest growing Indian broker with free trading API. Instant onboarding, paper trading support.',
        features: ['Equity', 'F&O', 'Paper Trading', 'Free API'],
        apiKeyGuideUrl: 'https://dhanhq.co/docs/v2/',
        ipWhitelistRequired: false,
        fields: [
            { key: 'access_token', label: 'Access Token', placeholder: 'Your DhanHQ access token', secret: true },
            { key: 'client_id', label: 'Client ID', placeholder: 'Your Dhan client ID' },
        ],
        setupSteps: [
            'Go to **[DhanHQ](https://dhanhq.co/)** and log in with your Dhan account',
            'Navigate to **API Access** section in your dashboard',
            'Generate an **Access Token** — this is your permanent API key',
            'Copy your **Client ID** from the profile section',
            'Dhan tokens are **long-lived** — no daily re-login needed',
        ],
    },
    {
        id: 'fyers',
        name: 'Fyers',
        color: '#2E7D32',
        logo: 'FY',
        category: 'indian',
        description: 'Popular for options trading with free API v3. Supports equity, F&O, and real-time data.',
        features: ['Equity', 'F&O', 'Options Chain', 'Free API'],
        apiKeyGuideUrl: 'https://myapi.fyers.in/docs/',
        ipWhitelistRequired: false,
        oauth: true,
        fields: [
            { key: 'api_key', label: 'App ID', placeholder: 'Your Fyers App ID (e.g. ABC123-100)' },
            { key: 'api_secret', label: 'Secret Key', placeholder: 'Your Fyers secret key', secret: true },
            { key: 'access_token', label: 'Access Token', placeholder: 'Generated after OAuth login', secret: true },
        ],
        setupSteps: [
            'Go to **[Fyers API Portal](https://myapi.fyers.in/)** and create a new app',
            'Copy the **App ID** and **Secret Key**',
            'Set the **Redirect URL** to your Insight backend URL',
            'Complete the **OAuth login flow** to get an **Access Token**',
            'Access token expires daily — re-authenticate each morning',
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
    // MT5-specific fields
    mt5_login?: string;
    mt5_password?: string;
    mt5_server?: string;
    mt5_account_id?: string;
    // Indian broker fields
    client_id?: string;
    access_token?: string;
    totp_secret?: string;
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
    // MT5-specific
    mt5_login?: string;
    mt5_password?: string;
    mt5_server?: string;
    // Indian broker fields
    client_id?: string;
    access_token?: string;
    totp_secret?: string;
    password?: string;
    environment: 'live' | 'testnet';
}
