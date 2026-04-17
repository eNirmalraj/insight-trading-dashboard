import { supabaseAdmin } from './supabaseAdmin';
import { decrypt } from './exchangeConnector';
import { generateTOTP } from '../utils/totp';
import ccxt, { Exchange as CCXTExchange } from 'ccxt';

// ── Unified trade types ─────────────────────────────────

export interface TradeOrder {
    exchangeKeyId: string;
    symbol: string;         // e.g. "BTCUSDT", "RELIANCE", "EURUSD"
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity: number;       // units, lots, or base-asset amount
    price?: number;         // required for LIMIT
    stopLoss?: number;
    takeProfit?: number;
    productType?: string;   // Indian: 'CNC' | 'MIS' | 'NRML' — crypto: 'SPOT' | 'FUTURES'
}

export interface TradeResult {
    ok: boolean;
    orderId?: string;
    filledPrice?: number;
    filledQuantity?: number;
    status?: string;
    error?: string;
    rawResponse?: any;
}

// ── Crypto (CCXT) ───────────────────────────────────────

const placeCryptoOrder = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const apiKey = decrypt(row.api_key);
    const secret = decrypt(row.api_secret);
    const passphrase = row.passphrase ? decrypt(row.passphrase) : undefined;
    const isTestnet = row.environment === 'testnet';

    let exchange: CCXTExchange;
    if (row.exchange === 'binance') {
        exchange = new ccxt.binance({ apiKey, secret, enableRateLimit: true });
    } else if (row.exchange === 'bitget') {
        exchange = new ccxt.bitget({ apiKey, secret, password: passphrase, enableRateLimit: true });
    } else {
        return { ok: false, error: `Unsupported crypto exchange: ${row.exchange}` };
    }
    if (isTestnet) exchange.setSandboxMode(true);

    try {
        const params: any = {};
        if (order.stopLoss) params.stopLoss = { triggerPrice: order.stopLoss };
        if (order.takeProfit) params.takeProfit = { triggerPrice: order.takeProfit };

        const ccxtOrder = await exchange.createOrder(
            order.symbol,
            order.type.toLowerCase() as any,
            order.side.toLowerCase() as any,
            order.quantity,
            order.price,
            params
        );

        return {
            ok: true,
            orderId: String(ccxtOrder.id),
            filledPrice: ccxtOrder.price || ccxtOrder.average || 0,
            filledQuantity: ccxtOrder.filled || 0,
            status: ccxtOrder.status,
            rawResponse: ccxtOrder,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'Order failed' };
    }
};

// ── MT5 (MetaApi REST) ──────────────────────────────────

const placeMT5Order = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const accountId = row.mt5_account_id;
    const token = process.env.METAAPI_TOKEN;
    if (!accountId || !token) {
        return { ok: false, error: 'MT5 account not provisioned or METAAPI_TOKEN missing.' };
    }

    try {
        const payload = {
            actionType: order.side === 'BUY' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL',
            symbol: order.symbol,
            volume: order.quantity,
            ...(order.price && order.type === 'LIMIT'
                ? {
                      openPrice: order.price,
                      actionType: order.side === 'BUY' ? 'ORDER_TYPE_BUY_LIMIT' : 'ORDER_TYPE_SELL_LIMIT',
                  }
                : {}),
            ...(order.stopLoss ? { stopLoss: order.stopLoss } : {}),
            ...(order.takeProfit ? { takeProfit: order.takeProfit } : {}),
        };

        const res = await fetch(
            `https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${accountId}/trade`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'auth-token': token },
                body: JSON.stringify(payload),
            }
        );

        const data = await res.json();
        if (!res.ok || data.stringCode !== 'TRADE_RETCODE_DONE') {
            return { ok: false, error: data.message || data.stringCode || 'MT5 order failed', rawResponse: data };
        }

        return {
            ok: true,
            orderId: String(data.orderId || data.positionId || ''),
            filledPrice: data.openPrice || 0,
            filledQuantity: order.quantity,
            status: 'FILLED',
            rawResponse: data,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message || 'MT5 trade error' };
    }
};

// ── Zerodha ─────────────────────────────────────────────

const placeZerodhaOrder = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const apiKey = decrypt(row.api_key);
    const accessToken = decrypt(row.access_token);

    try {
        const body = new URLSearchParams({
            tradingsymbol: order.symbol,
            exchange: order.symbol.length <= 10 ? 'NSE' : 'NFO',
            transaction_type: order.side,
            order_type: order.type,
            quantity: String(order.quantity),
            product: order.productType || 'MIS',
            validity: 'DAY',
            ...(order.price ? { price: String(order.price) } : {}),
            ...(order.stopLoss ? { trigger_price: String(order.stopLoss) } : {}),
        });

        const res = await fetch('https://api.kite.trade/orders/regular', {
            method: 'POST',
            headers: {
                'X-Kite-Version': '3',
                'Authorization': `token ${apiKey}:${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });

        const data = await res.json();
        if (data.status === 'error') {
            return { ok: false, error: data.message || 'Zerodha order failed' };
        }

        return {
            ok: true,
            orderId: data.data?.order_id,
            filledQuantity: order.quantity,
            status: 'PENDING',
            rawResponse: data,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message };
    }
};

// ── Angel One ───────────────────────────────────────────

const placeAngelOneOrder = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const apiKey = decrypt(row.api_key);
    const clientId = decrypt(row.client_id);
    const password = decrypt(row.passphrase); // MPIN
    const totpSecret = row.totp_secret ? decrypt(row.totp_secret) : '';

    try {
        // Login to get JWT
        const totp = totpSecret ? generateTOTP(totpSecret) : '';
        const loginRes = await fetch('https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-UserType': 'USER',
                'X-SourceID': 'WEB',
                'X-ClientLocalIP': '127.0.0.1',
                'X-ClientPublicIP': '127.0.0.1',
                'X-MACAddress': '00:00:00:00:00:00',
                'X-PrivateKey': apiKey,
            },
            body: JSON.stringify({ clientcode: clientId, password, totp }),
        });
        const loginData = await loginRes.json();
        if (!loginData.data?.jwtToken) {
            return { ok: false, error: loginData.message || 'Angel One login failed' };
        }
        const jwt = loginData.data.jwtToken;

        // Place order
        const orderBody = {
            variety: 'NORMAL',
            tradingsymbol: order.symbol,
            symboltoken: '', // requires instrument lookup — left empty for now
            transactiontype: order.side,
            exchange: 'NSE',
            ordertype: order.type,
            producttype: order.productType || 'INTRADAY',
            duration: 'DAY',
            quantity: String(order.quantity),
            ...(order.price ? { price: String(order.price) } : { price: '0' }),
            ...(order.stopLoss ? { triggerprice: String(order.stopLoss) } : {}),
        };

        const orderRes = await fetch('https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
                'X-PrivateKey': apiKey,
                'X-UserType': 'USER',
                'X-SourceID': 'WEB',
            },
            body: JSON.stringify(orderBody),
        });
        const orderData = await orderRes.json();
        if (!orderData.data?.orderid) {
            return { ok: false, error: orderData.message || 'Order placement failed' };
        }

        return {
            ok: true,
            orderId: orderData.data.orderid,
            filledQuantity: order.quantity,
            status: 'PENDING',
            rawResponse: orderData,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message };
    }
};

// ── Upstox ──────────────────────────────────────────────

const placeUpstoxOrder = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const accessToken = decrypt(row.access_token);

    try {
        const body = {
            quantity: order.quantity,
            product: order.productType || 'I', // I=Intraday, D=Delivery
            validity: 'DAY',
            price: order.price || 0,
            tag: 'insight',
            instrument_token: order.symbol, // user provides the instrument token
            order_type: order.type,
            transaction_type: order.side,
            disclosed_quantity: 0,
            trigger_price: order.stopLoss || 0,
            is_amo: false,
        };

        const res = await fetch('https://api.upstox.com/v2/order/place', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (data.status !== 'success') {
            return { ok: false, error: data.errors?.[0]?.message || 'Upstox order failed' };
        }

        return {
            ok: true,
            orderId: data.data?.order_id,
            filledQuantity: order.quantity,
            status: 'PENDING',
            rawResponse: data,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message };
    }
};

// ── Dhan ────────────────────────────────────────────────

const placeDhanOrder = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const accessToken = decrypt(row.access_token);
    const clientId = decrypt(row.client_id);

    try {
        const body = {
            dhanClientId: clientId,
            correlationId: `insight-${Date.now()}`,
            transactionType: order.side,
            exchangeSegment: 'NSE_EQ',
            productType: order.productType || 'INTRADAY',
            orderType: order.type,
            validity: 'DAY',
            securityId: order.symbol, // Dhan uses security ID, not symbol name
            quantity: order.quantity,
            disclosedQuantity: 0,
            price: order.price || 0,
            triggerPrice: order.stopLoss || 0,
            afterMarketOrder: false,
        };

        const res = await fetch('https://api.dhan.co/v2/orders', {
            method: 'POST',
            headers: {
                'access-token': accessToken,
                'client-id': clientId,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok || !data.orderId) {
            return { ok: false, error: data.remarks || data.errorMessage || 'Dhan order failed' };
        }

        return {
            ok: true,
            orderId: data.orderId,
            filledQuantity: order.quantity,
            status: data.orderStatus || 'PENDING',
            rawResponse: data,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message };
    }
};

// ── Fyers ───────────────────────────────────────────────

const placeFyersOrder = async (row: any, order: TradeOrder): Promise<TradeResult> => {
    const apiKey = decrypt(row.api_key);
    const accessToken = decrypt(row.access_token);

    try {
        const body = {
            symbol: order.symbol,
            qty: order.quantity,
            type: order.type === 'MARKET' ? 2 : 1, // 1=Limit, 2=Market, 3=SL, 4=SL-M
            side: order.side === 'BUY' ? 1 : -1,
            productType: order.productType || 'INTRADAY',
            limitPrice: order.price || 0,
            stopPrice: order.stopLoss || 0,
            validity: 'DAY',
            disclosedQty: 0,
            offlineOrder: false,
            orderTag: 'insight',
        };

        const res = await fetch('https://api-t1.fyers.in/api/v3/orders/sync', {
            method: 'POST',
            headers: {
                'Authorization': `${apiKey}:${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (data.s !== 'ok') {
            return { ok: false, error: data.message || 'Fyers order failed' };
        }

        return {
            ok: true,
            orderId: data.id,
            filledQuantity: order.quantity,
            status: 'PENDING',
            rawResponse: data,
        };
    } catch (err: any) {
        return { ok: false, error: err?.message };
    }
};

// ── Unified router ──────────────────────────────────────

export const executeTradeOrder = async (order: TradeOrder): Promise<TradeResult> => {
    const { data: row, error } = await supabaseAdmin
        .from('user_exchange_keys')
        .select('*')
        .eq('id', order.exchangeKeyId)
        .single();

    if (error || !row) {
        return { ok: false, error: 'Exchange connection not found' };
    }
    if (!row.is_active) {
        return { ok: false, error: 'Exchange connection is paused' };
    }

    console.log(`[Trade] ${order.side} ${order.quantity} ${order.symbol} via ${row.exchange} (${row.environment})`);

    let result: TradeResult;
    switch (row.exchange) {
        case 'binance':
        case 'bitget':
            result = await placeCryptoOrder(row, order);
            break;
        case 'mt5':
            result = await placeMT5Order(row, order);
            break;
        case 'zerodha':
            result = await placeZerodhaOrder(row, order);
            break;
        case 'angelone':
            result = await placeAngelOneOrder(row, order);
            break;
        case 'upstox':
            result = await placeUpstoxOrder(row, order);
            break;
        case 'dhan':
            result = await placeDhanOrder(row, order);
            break;
        case 'fyers':
            result = await placeFyersOrder(row, order);
            break;
        default:
            result = { ok: false, error: `Unsupported exchange: ${row.exchange}` };
    }

    // Log order to signal_executions (if applicable) — caller can do this
    console.log(`[Trade] Result:`, result.ok ? `OK order=${result.orderId}` : `FAIL ${result.error}`);
    return result;
};
