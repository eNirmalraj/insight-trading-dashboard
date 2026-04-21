// backend/server/src/services/binanceUserDataStream.ts
// Per-credential user-data WebSocket manager for Binance Futures.
// Handles listenKey creation, WS connection, keepalive, and reconnect.

import WebSocket from 'ws';
import { BrokerCredentials, FillEvent } from '../engine/brokerAdapters/types';

type Network = 'mainnet' | 'testnet';

interface StreamState {
    credId: string;
    network: Network;
    apiKey: string;
    apiSecret: string;
    listenKey: string;
    ws: WebSocket | null;
    callbacks: Set<(fill: FillEvent) => void>;
    keepaliveTimer: NodeJS.Timeout | null;
    reconnectAttempts: number;
}

// Binance retired testnet.binancefuture.com in favor of Demo Trading.
// REST calls for demo futures live at demo-fapi.binance.com.
// WebSocket base for demo is not officially documented in ccxt yet —
// demo-fstream.binance.com is the current documented stream host.
const REST_BASE = {
    mainnet: 'https://fapi.binance.com',
    testnet: 'https://demo-fapi.binance.com',
};
const WS_BASE = {
    mainnet: 'wss://fstream.binance.com/ws',
    testnet: 'wss://demo-fstream.binance.com/ws',
};

const streams: Map<string, StreamState> = new Map();

function networkOf(creds: BrokerCredentials): Network {
    const n = (creds as any).network;
    return n === 'testnet' ? 'testnet' : 'mainnet';
}

async function createListenKey(network: Network, apiKey: string): Promise<string> {
    const r = await fetch(`${REST_BASE[network]}/fapi/v1/listenKey`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey },
    });
    if (!r.ok) throw new Error(`createListenKey failed: ${r.status} ${await r.text()}`);
    const data = (await r.json()) as { listenKey: string };
    return data.listenKey;
}

async function keepListenKeyAlive(network: Network, apiKey: string): Promise<void> {
    await fetch(`${REST_BASE[network]}/fapi/v1/listenKey`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': apiKey },
    });
}

function openWs(state: StreamState): void {
    const url = `${WS_BASE[state.network]}/${state.listenKey}`;
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.on('open', () => {
        console.log(`[UserDataStream] WS open for ${state.credId} (${state.network})`);
        state.reconnectAttempts = 0;
    });

    ws.on('message', (raw: WebSocket.Data) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.e === 'ORDER_TRADE_UPDATE') {
                const o = msg.o;
                if (o.X === 'FILLED' || o.X === 'PARTIALLY_FILLED') {
                    const fill: FillEvent = {
                        brokerOrderId: String(o.i),
                        symbol: String(o.s),
                        fillQty: parseFloat(o.l),
                        fillPrice: parseFloat(o.L),
                        isMaker: !!o.m,
                        commission: parseFloat(o.n || '0'),
                        commissionAsset: String(o.N || ''),
                        raw: msg,
                    };
                    state.callbacks.forEach((cb) => {
                        try { cb(fill); } catch (e) { console.error('[UserDataStream] callback error:', e); }
                    });
                }
            }
        } catch (e) {
            console.error('[UserDataStream] message parse error:', e);
        }
    });

    ws.on('close', () => {
        console.log(`[UserDataStream] WS closed for ${state.credId}, reconnecting...`);
        state.ws = null;
        scheduleReconnect(state);
    });

    ws.on('error', (err) => {
        console.error(`[UserDataStream] WS error for ${state.credId}:`, err.message);
        // 'close' usually follows — reconnect handled there
    });
}

function scheduleReconnect(state: StreamState): void {
    const delay = Math.min(30_000, 1_000 * Math.pow(2, state.reconnectAttempts));
    state.reconnectAttempts++;
    setTimeout(async () => {
        try {
            state.listenKey = await createListenKey(state.network, state.apiKey);
            openWs(state);
        } catch (err: any) {
            console.error('[UserDataStream] reconnect failed:', err?.message);
            scheduleReconnect(state);
        }
    }, delay);
}

export async function subscribe(
    creds: BrokerCredentials,
    onFill: (fill: FillEvent) => void,
): Promise<() => void> {
    let state = streams.get(creds.id);
    if (state) {
        state.callbacks.add(onFill);
        return () => {
            state!.callbacks.delete(onFill);
            if (state!.callbacks.size === 0) tearDown(state!);
        };
    }

    const network = networkOf(creds);
    const listenKey = await createListenKey(network, creds.apiKey);
    state = {
        credId: creds.id,
        network,
        apiKey: creds.apiKey,
        apiSecret: creds.apiSecret,
        listenKey,
        ws: null,
        callbacks: new Set([onFill]),
        keepaliveTimer: null,
        reconnectAttempts: 0,
    };
    streams.set(creds.id, state);

    openWs(state);

    state.keepaliveTimer = setInterval(async () => {
        try {
            await keepListenKeyAlive(state!.network, state!.apiKey);
        } catch (err: any) {
            console.error('[UserDataStream] keepalive failed, reconnecting:', err?.message);
            try { state!.ws?.terminate(); } catch {}
        }
    }, 30 * 60 * 1000);

    return () => {
        state!.callbacks.delete(onFill);
        if (state!.callbacks.size === 0) tearDown(state!);
    };
}

function tearDown(state: StreamState): void {
    if (state.keepaliveTimer) clearInterval(state.keepaliveTimer);
    try { state.ws?.terminate(); } catch {}
    streams.delete(state.credId);
    console.log(`[UserDataStream] torn down ${state.credId}`);
}

export const binanceUserDataStream = { subscribe };
