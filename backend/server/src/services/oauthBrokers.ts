import crypto from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';
import { encrypt } from './exchangeConnector';

// ── Config ──────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Upstox
const UPSTOX_API_KEY = process.env.UPSTOX_API_KEY || '';
const UPSTOX_API_SECRET = process.env.UPSTOX_API_SECRET || '';
const UPSTOX_REDIRECT = `${BACKEND_URL}/api/oauth/upstox/callback`;

// Fyers
const FYERS_APP_ID = process.env.FYERS_APP_ID || '';
const FYERS_SECRET_KEY = process.env.FYERS_SECRET_KEY || '';
const FYERS_REDIRECT = `${BACKEND_URL}/api/oauth/fyers/callback`;

// Zerodha (for when user registers)
const ZERODHA_API_KEY = process.env.ZERODHA_API_KEY || '';
const ZERODHA_API_SECRET = process.env.ZERODHA_API_SECRET || '';
const ZERODHA_REDIRECT = `${BACKEND_URL}/api/oauth/zerodha/callback`;

// ── State management (CSRF protection) ─────────────────

interface PendingOAuth {
    userId: string;
    exchange: string;
    nickname: string;
    environment: string;
    createdAt: number;
}

const pendingStates = new Map<string, PendingOAuth>();

const createState = (data: PendingOAuth): string => {
    const state = crypto.randomBytes(32).toString('hex');
    pendingStates.set(state, { ...data, createdAt: Date.now() });
    // Clean up old states (older than 10 minutes)
    for (const [key, val] of pendingStates) {
        if (Date.now() - val.createdAt > 600_000) pendingStates.delete(key);
    }
    return state;
};

const consumeState = (state: string): PendingOAuth | null => {
    const data = pendingStates.get(state);
    if (!data) return null;
    pendingStates.delete(state);
    if (Date.now() - data.createdAt > 600_000) return null; // expired
    return data;
};

// ── Upstox OAuth ────────────────────────────────────────

export const getUpstoxAuthUrl = (userId: string, nickname: string, environment: string): string => {
    if (!UPSTOX_API_KEY) throw new Error('UPSTOX_API_KEY not configured');
    const state = createState({ userId, exchange: 'upstox', nickname, environment, createdAt: 0 });
    return `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${UPSTOX_API_KEY}&redirect_uri=${encodeURIComponent(UPSTOX_REDIRECT)}&state=${state}`;
};

export const handleUpstoxCallback = async (code: string, state: string) => {
    const pending = consumeState(state);
    if (!pending) throw new Error('Invalid or expired OAuth state. Please try again.');

    // Exchange code for access token
    const tokenRes = await fetch('https://api.upstox.com/v2/login/authorization/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({
            code,
            client_id: UPSTOX_API_KEY,
            client_secret: UPSTOX_API_SECRET,
            redirect_uri: UPSTOX_REDIRECT,
            grant_type: 'authorization_code',
        }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
        throw new Error(tokenData.errors?.[0]?.message || 'Failed to get access token from Upstox');
    }

    // Fetch profile to get user name
    const profileRes = await fetch('https://api.upstox.com/v2/user/profile', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' },
    });
    const profileData = await profileRes.json();
    const userName = profileData.data?.user_name || '';

    // Store in database
    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys')
        .insert({
            user_id: pending.userId,
            exchange: 'upstox',
            nickname: pending.nickname || `Upstox - ${userName}`,
            api_key: encrypt(UPSTOX_API_KEY),
            api_secret: encrypt(UPSTOX_API_SECRET),
            access_token: encrypt(tokenData.access_token),
            environment: pending.environment,
            is_active: true,
            permissions: ['Read', 'Trading'],
            last_tested_at: new Date().toISOString(),
            last_test_status: 'success',
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { id: data.id, userName };
};

// ── Fyers OAuth ─────────────────────────────────────────

export const getFyersAuthUrl = (userId: string, nickname: string, environment: string): string => {
    if (!FYERS_APP_ID) throw new Error('FYERS_APP_ID not configured');
    const state = createState({ userId, exchange: 'fyers', nickname, environment, createdAt: 0 });
    return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${FYERS_APP_ID}&redirect_uri=${encodeURIComponent(FYERS_REDIRECT)}&response_type=code&state=${state}`;
};

export const handleFyersCallback = async (code: string, state: string) => {
    const pending = consumeState(state);
    if (!pending) throw new Error('Invalid or expired OAuth state. Please try again.');

    // Generate SHA-256 hash of app_id:secret
    const hash = crypto.createHash('sha256').update(`${FYERS_APP_ID}:${FYERS_SECRET_KEY}`).digest('hex');

    // Exchange code for access token
    const tokenRes = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            appIdHash: hash,
            code,
        }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.s !== 'ok' || !tokenData.access_token) {
        throw new Error(tokenData.message || 'Failed to get access token from Fyers');
    }

    // Fetch profile
    const profileRes = await fetch('https://api-t1.fyers.in/api/v3/profile', {
        headers: { 'Authorization': `${FYERS_APP_ID}:${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();
    const userName = profileData.data?.name || profileData.data?.fy_id || '';

    // Store in database
    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys')
        .insert({
            user_id: pending.userId,
            exchange: 'fyers',
            nickname: pending.nickname || `Fyers - ${userName}`,
            api_key: encrypt(FYERS_APP_ID),
            api_secret: encrypt(FYERS_SECRET_KEY),
            access_token: encrypt(tokenData.access_token),
            environment: pending.environment,
            is_active: true,
            permissions: ['Read', 'Trading'],
            last_tested_at: new Date().toISOString(),
            last_test_status: 'success',
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { id: data.id, userName };
};

// ── Zerodha OAuth (ready for when user registers) ───────

export const getZerodhaAuthUrl = (userId: string, nickname: string, environment: string): string => {
    if (!ZERODHA_API_KEY) throw new Error('ZERODHA_API_KEY not configured. Register at kite.trade first.');
    const state = createState({ userId, exchange: 'zerodha', nickname, environment, createdAt: 0 });
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${ZERODHA_API_KEY}&state=${state}`;
};

export const handleZerodhaCallback = async (requestToken: string, state: string) => {
    const pending = consumeState(state);
    if (!pending) throw new Error('Invalid or expired OAuth state. Please try again.');

    // Generate checksum
    const checksum = crypto.createHash('sha256')
        .update(`${ZERODHA_API_KEY}${requestToken}${ZERODHA_API_SECRET}`)
        .digest('hex');

    // Exchange request token for access token
    const tokenRes = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
        body: new URLSearchParams({
            api_key: ZERODHA_API_KEY,
            request_token: requestToken,
            checksum,
        }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.status === 'error' || !tokenData.data?.access_token) {
        throw new Error(tokenData.message || 'Failed to get access token from Zerodha');
    }

    const accessToken = tokenData.data.access_token;
    const userName = tokenData.data.user_name || tokenData.data.user_shortname || '';

    // Store in database
    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys')
        .insert({
            user_id: pending.userId,
            exchange: 'zerodha',
            nickname: pending.nickname || `Zerodha - ${userName}`,
            api_key: encrypt(ZERODHA_API_KEY),
            api_secret: encrypt(ZERODHA_API_SECRET),
            access_token: encrypt(accessToken),
            environment: pending.environment,
            is_active: true,
            permissions: ['Read', 'Trading'],
            last_tested_at: new Date().toISOString(),
            last_test_status: 'success',
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return { id: data.id, userName };
};

// ── Check which OAuth brokers are configured ────────────

export const getOAuthStatus = () => ({
    upstox: !!UPSTOX_API_KEY,
    fyers: !!FYERS_APP_ID,
    zerodha: !!ZERODHA_API_KEY,
});
