// backend/server/src/services/brokerOrderStorage.ts
// Thin CRUD wrapper over broker_orders and fills_log tables.

import { supabaseAdmin } from './supabaseAdmin';
import { BrokerOrderLeg, BrokerOrderStatus, FillEvent } from '../engine/brokerAdapters/types';

export interface BrokerOrderRow {
    id: string;
    execution_id: string;
    user_id: string | null;
    broker: string;
    broker_order_id: string | null;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    role: string;
    price: number | null;
    stop_price: number | null;
    qty: number;
    status: BrokerOrderStatus;
    filled_qty: number;
    avg_fill_price: number | null;
    rejected_reason: string | null;
    created_at: string;
    updated_at: string;
}

export interface InsertBrokerOrderInput {
    executionId: string;
    userId: string | null;
    broker: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    leg: BrokerOrderLeg;
}

export async function insertBrokerOrder(input: InsertBrokerOrderInput): Promise<BrokerOrderRow | null> {
    const { data, error } = await supabaseAdmin
        .from('broker_orders')
        .insert({
            execution_id: input.executionId,
            user_id: input.userId,
            broker: input.broker,
            broker_order_id: input.leg.brokerOrderId,
            symbol: input.symbol,
            side: input.side,
            type: input.leg.type,
            role: input.leg.role,
            price: input.leg.price,
            stop_price: input.leg.stopPrice,
            qty: input.leg.qty,
            status: input.leg.status,
            rejected_reason: input.leg.rejectedReason ?? null,
        })
        .select('*')
        .single();

    if (error) {
        console.error('[brokerOrderStorage] insertBrokerOrder failed:', error.message);
        return null;
    }
    return data as BrokerOrderRow;
}

export async function updateBrokerOrderStatus(
    id: string,
    status: BrokerOrderStatus,
    filledQty?: number,
    avgFillPrice?: number,
): Promise<boolean> {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (filledQty !== undefined) update.filled_qty = filledQty;
    if (avgFillPrice !== undefined) update.avg_fill_price = avgFillPrice;

    const { error } = await supabaseAdmin
        .from('broker_orders')
        .update(update)
        .eq('id', id);

    if (error) {
        console.error('[brokerOrderStorage] updateBrokerOrderStatus failed:', error.message);
        return false;
    }
    return true;
}

export async function insertFill(params: {
    brokerOrderId: string;
    executionId: string;
    userId: string | null;
    fill: FillEvent;
}): Promise<void> {
    const { error } = await supabaseAdmin.from('fills_log').insert({
        broker_order_id: params.brokerOrderId,
        execution_id: params.executionId,
        user_id: params.userId,
        fill_qty: params.fill.fillQty,
        fill_price: params.fill.fillPrice,
        is_maker: params.fill.isMaker,
        commission: params.fill.commission,
        commission_asset: params.fill.commissionAsset,
        raw_event: params.fill.raw as object,
    });
    if (error) {
        console.error('[brokerOrderStorage] insertFill failed:', error.message);
    }
}
