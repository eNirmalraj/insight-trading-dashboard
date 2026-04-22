// backend/server/src/services/fillReconciler.ts
// Translates broker fill events into DB updates on broker_orders,
// fills_log, and signal_executions.
//
// Wiring: at worker start, startFillStreams() opens a user-data WebSocket
// for every active Binance credential and registers handleFill as the
// callback. Binance's ORDER_TRADE_UPDATE events then flow into handleFill
// and get persisted. stopFillStreams() closes all streams on shutdown.

import { supabaseAdmin } from './supabaseAdmin';
import { FillEvent, BrokerCredentials } from '../engine/brokerAdapters/types';
import { insertFill, updateBrokerOrderStatus } from './brokerOrderStorage';
import { closeExecution } from './executionStorage';
import { credentialVault } from './credentialVault';
import { CloseReason } from '../constants/enums';

export async function handleFill(fill: FillEvent): Promise<void> {
    // 1. Find the broker_orders row for this broker_order_id
    const { data: order, error } = await supabaseAdmin
        .from('broker_orders')
        .select('id, execution_id, user_id, role, qty, avg_fill_price, filled_qty')
        .eq('broker_order_id', fill.brokerOrderId)
        .maybeSingle();

    if (error) {
        console.error('[fillReconciler] broker_orders lookup failed:', error.message);
        return;
    }
    if (!order) {
        console.warn(`[fillReconciler] fill for unknown brokerOrderId=${fill.brokerOrderId} — ignoring`);
        return;
    }

    // 2. Insert fills_log row
    await insertFill({
        brokerOrderId: order.id,
        executionId: order.execution_id,
        userId: order.user_id,
        fill,
    });

    // 3. Update broker_orders row
    const newFilledQty = Number(order.filled_qty || 0) + fill.fillQty;
    const prevAvg = Number(order.avg_fill_price || 0);
    const prevQty = Number(order.filled_qty || 0);
    const newAvg = newFilledQty > 0
        ? (prevAvg * prevQty + fill.fillPrice * fill.fillQty) / newFilledQty
        : fill.fillPrice;
    const fullyFilled = newFilledQty >= Number(order.qty);

    await updateBrokerOrderStatus(
        order.id,
        fullyFilled ? 'Filled' : 'Open',
        newFilledQty,
        newAvg,
    );

    // 4. If SL or TP fully filled → close the signal_executions row
    if (fullyFilled && (order.role === 'SL' || order.role === 'TP')) {
        const reason = order.role === 'SL' ? CloseReason.SL : CloseReason.TP;
        const pnl = 0; // Phase 1 defers precise P&L calc; commissions etc. come later
        await closeExecution(order.execution_id, reason, fill.fillPrice, pnl);

        // Cancel the opposing leg — best-effort
        const oppositeRole = order.role === 'SL' ? 'TP' : 'SL';
        const { data: oppositeLeg } = await supabaseAdmin
            .from('broker_orders')
            .select('id, broker_order_id, symbol')
            .eq('execution_id', order.execution_id)
            .eq('role', oppositeRole)
            .eq('status', 'Open')
            .maybeSingle();

        if (oppositeLeg?.broker_order_id) {
            // Mark as Cancelled in our DB; the actual Binance cancel happens
            // via ORDER_TRADE_UPDATE when Binance closes the orphaned leg
            // (reduceOnly orders auto-cancel when the position closes).
            await updateBrokerOrderStatus(oppositeLeg.id, 'Cancelled');
        }
    }
}

// ── Stream orchestration ─────────────────────────────────────────────

// Open streams per credential. The key is user_exchange_keys_v2.id so each
// credential multiplexes one WebSocket; the stream service itself handles
// listenKey keepalive, reconnect, and callback fan-out.
const activeUnsubscribers: Map<string, () => void> = new Map();

// Open a user-data WebSocket for every active Binance credential and route
// fills into handleFill. Idempotent: skips credentials already streaming.
export async function startFillStreams(): Promise<number> {
    const { data: rows, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('id, user_id, broker, environment')
        .eq('broker', 'binance')
        .eq('is_active', true);

    if (error) {
        console.error('[fillReconciler] failed to list credentials:', error.message);
        return 0;
    }

    // Import the adapter lazily to avoid a module-load cycle with the
    // broker registry at worker startup.
    const { binanceBrokerAdapter } = await import('../engine/brokerAdapters/binanceBroker');

    let opened = 0;
    for (const row of rows ?? []) {
        if (activeUnsubscribers.has(row.id)) continue;
        const full = await credentialVault.retrieveById(row.id);
        if (!full || !full.apiKey || !full.apiSecret) continue;

        const creds: BrokerCredentials & { network?: string } = {
            id: full.id,
            userId: full.userId,
            broker: full.broker,
            apiKey: full.apiKey,
            apiSecret: full.apiSecret,
            network: row.environment === 'testnet' || row.environment === 'demo' ? 'testnet' : 'mainnet',
        };

        const unsubscribe = binanceBrokerAdapter.subscribeFills(creds, (fill) => {
            void handleFill(fill).catch((e) =>
                console.error('[fillReconciler] handleFill threw:', e?.message),
            );
        });
        activeUnsubscribers.set(row.id, unsubscribe);
        opened++;
    }

    console.log(`[fillReconciler] opened ${opened} fill stream(s)`);
    return opened;
}

export function stopFillStreams(): void {
    for (const [id, unsub] of activeUnsubscribers.entries()) {
        try { unsub(); } catch (e) { console.warn(`[fillReconciler] unsubscribe ${id} failed:`, e); }
    }
    activeUnsubscribers.clear();
}

export const fillReconciler = { handleFill, startFillStreams, stopFillStreams };
