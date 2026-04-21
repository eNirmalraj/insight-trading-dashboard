// backend/server/src/engine/brokerAdapters/binanceBroker.ts
// Binance USDT-M Futures broker adapter. Uses ccxt for signed REST calls.
// Supports testnet and mainnet via the `network` field on BrokerCredentials.

import ccxt from 'ccxt';
import {
    BrokerAdapter,
    BracketInput,
    BrokerCredentials,
    BracketResult,
    BrokerOrderLeg,
    FillEvent,
    BrokerPosition,
} from './types';
import { mapBinanceError } from './binanceErrorMap';
import { OmsError } from '../../services/omsErrors';
import { binanceUserDataStream } from '../../services/binanceUserDataStream';

type BinanceNetwork = 'mainnet' | 'testnet';

// Internal: creds carry { network: 'mainnet' | 'testnet' } but the type
// doesn't include it yet. Read from (creds as any).network with fallback.
function networkOf(creds: BrokerCredentials | null): BinanceNetwork {
    const n = (creds as any)?.network;
    return n === 'testnet' ? 'testnet' : 'mainnet';
}

function buildClient(creds: BrokerCredentials): any {
    const net = networkOf(creds);
    const client = new (ccxt as any).binanceusdm({
        apiKey: creds.apiKey,
        secret: creds.apiSecret,
        enableRateLimit: true,
        timeout: 10_000,
        options: { defaultType: 'future' },
    });
    if (net === 'testnet') {
        // Binance retired testnet.binancefuture.com; ccxt's setSandboxMode now
        // throws NotSupported. Route demo keys to demo-fapi.binance.com instead.
        const base = 'https://demo-fapi.binance.com';
        client.urls.api.fapiPublic = `${base}/fapi/v1`;
        client.urls.api.fapiPublicV2 = `${base}/fapi/v2`;
        client.urls.api.fapiPublicV3 = `${base}/fapi/v3`;
        client.urls.api.fapiPrivate = `${base}/fapi/v1`;
        client.urls.api.fapiPrivateV2 = `${base}/fapi/v2`;
        client.urls.api.fapiPrivateV3 = `${base}/fapi/v3`;
        client.urls.api.fapiData = `${base}/futures/data`;
    }
    return client;
}

function mapOrderStatus(binanceStatus: string): BrokerOrderLeg['status'] {
    switch (binanceStatus) {
        case 'NEW':
        case 'PARTIALLY_FILLED':
            return 'Open';
        case 'FILLED':
            return 'Filled';
        case 'CANCELED':
        case 'EXPIRED':
            return 'Cancelled';
        case 'REJECTED':
            return 'Rejected';
        default:
            return 'Pending';
    }
}

function mapOrderToLeg(o: any, role: BrokerOrderLeg['role']): BrokerOrderLeg {
    return {
        brokerOrderId: String(o.id ?? o.orderId),
        role,
        type: o.type?.toUpperCase() as BrokerOrderLeg['type'],
        status: mapOrderStatus(o.status ?? o.info?.status),
        price: o.price ?? null,
        stopPrice: o.stopPrice ?? o.info?.stopPrice ?? null,
        qty: o.amount ?? parseFloat(o.info?.origQty ?? '0'),
    };
}

async function pollOrderFilled(
    client: any,
    symbol: string,
    orderId: string,
    timeoutMs: number,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const o = await client.fetchOrder(orderId, symbol);
            if (o?.status === 'closed' || o?.info?.status === 'FILLED') return true;
            if (o?.status === 'canceled' || o?.info?.status === 'REJECTED') return false;
        } catch (err) {
            // transient — keep polling
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

async function submitStopWithRetry(
    client: any,
    symbol: string,
    side: 'buy' | 'sell',
    type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET',
    stopPrice: number,
    qty: number,
    role: BrokerOrderLeg['role'],
): Promise<BrokerOrderLeg> {
    const delays = [200, 400, 800];
    let lastErr: any = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
        try {
            const order = await client.createOrder(
                symbol,
                type.toLowerCase(),
                side,
                qty,
                undefined,
                { stopPrice, reduceOnly: true, closePosition: true },
            );
            return {
                brokerOrderId: String(order.id),
                role,
                type,
                status: 'Open',
                price: null,
                stopPrice,
                qty,
            };
        } catch (err: any) {
            lastErr = err;
            if (attempt < delays.length - 1) {
                await new Promise((r) => setTimeout(r, delays[attempt]));
            }
        }
    }
    return {
        brokerOrderId: null,
        role,
        type,
        status: 'Rejected',
        price: null,
        stopPrice,
        qty,
        rejectedReason: lastErr?.message || 'unknown error',
    };
}

export const binanceBrokerAdapter: BrokerAdapter = {
    async submitBracket(input: BracketInput, creds: BrokerCredentials | null): Promise<BracketResult> {
        if (!creds) throw OmsError.credential('Binance credentials required');
        const client = buildClient(creds);
        const opposite = input.side === 'BUY' ? 'sell' : 'buy';
        const sideBinance = input.side === 'BUY' ? 'buy' : 'sell';

        // --- Step 1: submit entry MARKET ---
        let entryOrder: any;
        try {
            entryOrder = await client.createOrder(
                input.symbol,
                'market',
                sideBinance,
                input.qty,
            );
        } catch (err: any) {
            // Entry failed — all three legs rejected
            const reason = err?.message || String(err);
            return {
                rejectedReason: reason,
                legs: [
                    { brokerOrderId: null, role: 'ENTRY', type: 'MARKET', status: 'Rejected', price: null, stopPrice: null, qty: input.qty, rejectedReason: reason },
                    { brokerOrderId: null, role: 'SL', type: 'STOP_MARKET', status: 'Rejected', price: null, stopPrice: input.stopLoss, qty: input.qty, rejectedReason: 'entry failed' },
                    { brokerOrderId: null, role: 'TP', type: 'TAKE_PROFIT_MARKET', status: 'Rejected', price: null, stopPrice: input.takeProfit, qty: input.qty, rejectedReason: 'entry failed' },
                ],
            };
        }

        // --- Step 2: poll entry until FILLED (up to 5s) ---
        const entryFilled = await pollOrderFilled(client, input.symbol, String(entryOrder.id), 5_000);
        if (!entryFilled) {
            // Timeout — cancel entry if still open
            try { await client.cancelOrder(String(entryOrder.id), input.symbol); } catch {}
            return {
                rejectedReason: 'entry fill timeout',
                legs: [
                    { brokerOrderId: String(entryOrder.id), role: 'ENTRY', type: 'MARKET', status: 'Cancelled', price: null, stopPrice: null, qty: input.qty, rejectedReason: 'fill timeout' },
                    { brokerOrderId: null, role: 'SL', type: 'STOP_MARKET', status: 'Rejected', price: null, stopPrice: input.stopLoss, qty: input.qty, rejectedReason: 'entry timeout' },
                    { brokerOrderId: null, role: 'TP', type: 'TAKE_PROFIT_MARKET', status: 'Rejected', price: null, stopPrice: input.takeProfit, qty: input.qty, rejectedReason: 'entry timeout' },
                ],
            };
        }

        // --- Step 3: submit SL + TP in parallel with retries ---
        const [slLeg, tpLeg] = await Promise.all([
            submitStopWithRetry(client, input.symbol, opposite, 'STOP_MARKET', input.stopLoss, input.qty, 'SL'),
            submitStopWithRetry(client, input.symbol, opposite, 'TAKE_PROFIT_MARKET', input.takeProfit, input.qty, 'TP'),
        ]);

        // --- Step 4: if either leg rejected — force close + return rejected ---
        if (slLeg.status === 'Rejected' || tpLeg.status === 'Rejected') {
            // Best-effort force close
            try {
                await client.createOrder(input.symbol, 'market', opposite, input.qty, undefined, { reduceOnly: true });
            } catch (e: any) {
                console.error('[binanceBroker] force-close failed:', e?.message || e);
            }
            // Cancel whichever leg did succeed
            if (slLeg.status !== 'Rejected' && slLeg.brokerOrderId) {
                try { await client.cancelOrder(slLeg.brokerOrderId, input.symbol); } catch {}
                slLeg.status = 'Cancelled';
            }
            if (tpLeg.status !== 'Rejected' && tpLeg.brokerOrderId) {
                try { await client.cancelOrder(tpLeg.brokerOrderId, input.symbol); } catch {}
                tpLeg.status = 'Cancelled';
            }
            return {
                rejectedReason: 'SL or TP placement failed — position force-closed',
                legs: [
                    { brokerOrderId: String(entryOrder.id), role: 'ENTRY', type: 'MARKET', status: 'Filled', price: entryOrder.average ?? null, stopPrice: null, qty: input.qty },
                    slLeg,
                    tpLeg,
                ],
            };
        }

        // --- Success ---
        return {
            legs: [
                { brokerOrderId: String(entryOrder.id), role: 'ENTRY', type: 'MARKET', status: 'Filled', price: entryOrder.average ?? null, stopPrice: null, qty: input.qty },
                slLeg,
                tpLeg,
            ],
        };
    },

    async cancelOrder(brokerOrderId: string, symbol: string, creds: BrokerCredentials | null): Promise<void> {
        if (!creds) throw new Error('binanceBroker.cancelOrder: credentials required');
        const client = buildClient(creds);
        try {
            await client.cancelOrder(brokerOrderId, symbol);
        } catch (err: any) {
            throw mapBinanceError(err);
        }
    },

    async getOpenOrders(symbol: string, creds: BrokerCredentials | null): Promise<BrokerOrderLeg[]> {
        if (!creds) throw new Error('binanceBroker.getOpenOrders: credentials required');
        const client = buildClient(creds);
        try {
            const orders = await client.fetchOpenOrders(symbol);
            return orders.map((o: any) => {
                // Infer role from type
                let role: BrokerOrderLeg['role'] = 'ENTRY';
                const t = (o.type || '').toUpperCase();
                if (t === 'STOP_MARKET' || t === 'STOP') role = 'SL';
                else if (t === 'TAKE_PROFIT_MARKET' || t === 'TAKE_PROFIT') role = 'TP';
                return mapOrderToLeg(o, role);
            });
        } catch (err: any) {
            throw mapBinanceError(err);
        }
    },

    async getPosition(symbol: string, creds: BrokerCredentials | null): Promise<BrokerPosition | null> {
        if (!creds) throw new Error('binanceBroker.getPosition: credentials required');
        const client = buildClient(creds);
        try {
            const positions = await client.fetchPositions([symbol]);
            const p = positions.find((x: any) => (x.symbol || '').replace('/', '').replace(':USDT', '') === symbol.replace('/', ''));
            if (!p || !p.contracts || p.contracts === 0) return null;
            const qty = p.side === 'long' ? p.contracts : -p.contracts;
            return {
                symbol,
                qty,
                avgEntryPrice: p.entryPrice ?? 0,
                unrealizedPnl: p.unrealizedPnl ?? 0,
            };
        } catch (err: any) {
            throw mapBinanceError(err);
        }
    },

    subscribeFills(creds: BrokerCredentials | null, onFill: (fill: FillEvent) => void): () => void {
        if (!creds) return () => {};
        let unsubscribe: (() => void) | null = null;
        // Fire-and-forget subscription
        binanceUserDataStream.subscribe(creds, onFill)
            .then((u) => { unsubscribe = u; })
            .catch((err) => console.error('[binanceBroker] subscribeFills failed:', err?.message));
        return () => { if (unsubscribe) unsubscribe(); };
    },

    async ping(creds: BrokerCredentials | null): Promise<boolean> {
        if (!creds) return false;
        const client = buildClient(creds);
        try {
            const balance = await client.fetchBalance();
            return !!balance;
        } catch (err: any) {
            console.error('[binanceBroker] ping failed:', err?.message || err);
            return false;
        }
    },
};
