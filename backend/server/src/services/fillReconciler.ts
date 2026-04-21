// backend/server/src/services/fillReconciler.ts
// Translates broker fill events into DB updates on broker_orders,
// fills_log, and signal_executions.

import { supabaseAdmin } from './supabaseAdmin';
import { FillEvent } from '../engine/brokerAdapters/types';
import { insertFill, updateBrokerOrderStatus } from './brokerOrderStorage';
import { closeExecution } from './executionStorage';
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

export const fillReconciler = { handleFill };
