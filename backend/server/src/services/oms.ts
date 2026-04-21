// backend/server/src/services/oms.ts
// Order Management System — single entry point for all order submissions.

import { supabaseAdmin } from './supabaseAdmin';
import { credentialVault } from './credentialVault';
import { insertBrokerOrder } from './brokerOrderStorage';
import { OmsError } from './omsErrors';
import { BracketInput, BrokerCredentials } from '../engine/brokerAdapters/types';
import { getBrokerAdapter } from '../engine/brokerAdapters';
import {
    BrokerType,
    Market,
    TradeDirection,
} from '../constants/enums';
import { RiskSettings } from '../engine/riskCalculator';
import { SignalExecutionRow } from './executionStorage';
import { computeQty as computeQtyFromSizer, SizingMode } from './positionSizer';

export interface OrderIntent {
    userId: string | null;
    broker: BrokerType;
    brokerCredentialId: string | null;
    signalId: string | null;
    watchlistStrategyId: string | null;
    symbol: string;
    market: Market;
    direction: TradeDirection;
    entryType: 'MARKET' | 'LIMIT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskSettings: RiskSettings;
    timeframe: string;
    // Phase 1: sizing mode + params used by live brokers.
    // Paper broker ignores these and uses lotSize × leverage from riskSettings.
    sizingMode?: SizingMode;
    sizingParams?: {
        notional?: number;
        riskPct?: number;
        riskFixed?: number;
        fixedQty?: number;
    };
    balance?: number;
}

// Step 1: Validate intent
function validateIntent(intent: OrderIntent): void {
    if (!intent.symbol) throw OmsError.validation('symbol required');
    if (!intent.entryPrice || intent.entryPrice <= 0) throw OmsError.validation('entryPrice must be positive');
    if (!intent.stopLoss || intent.stopLoss <= 0) throw OmsError.validation('stopLoss must be positive');
    if (!intent.takeProfit || intent.takeProfit <= 0) throw OmsError.validation('takeProfit must be positive');

    if (intent.direction === TradeDirection.BUY) {
        if (intent.stopLoss >= intent.entryPrice) throw OmsError.validation('BUY: stopLoss must be below entry');
        if (intent.takeProfit <= intent.entryPrice) throw OmsError.validation('BUY: takeProfit must be above entry');
    } else {
        if (intent.stopLoss <= intent.entryPrice) throw OmsError.validation('SELL: stopLoss must be above entry');
        if (intent.takeProfit >= intent.entryPrice) throw OmsError.validation('SELL: takeProfit must be below entry');
    }

    if (intent.broker !== BrokerType.PAPER && !intent.brokerCredentialId) {
        throw OmsError.validation(`${intent.broker} requires brokerCredentialId`);
    }
}

// Step 2: Normalize
function normalize(intent: OrderIntent): OrderIntent {
    return { ...intent, symbol: intent.symbol.toUpperCase() };
}

// Step 3: Position size
function resolveQty(intent: OrderIntent): number {
    // Paper broker: keep the trivial lot × leverage behavior from Phase 0
    if (intent.broker === BrokerType.PAPER) {
        const lot = intent.riskSettings.lotSize ?? 1;
        const leverage = intent.riskSettings.leverage ?? 1;
        return lot * leverage;
    }
    // Live brokers: use the sizing calculator
    const mode: SizingMode = intent.sizingMode ?? 'fixed_notional';
    const leverage = intent.riskSettings.leverage ?? 1;
    return computeQtyFromSizer({
        mode,
        notional: intent.sizingParams?.notional,
        riskPct: intent.sizingParams?.riskPct,
        riskFixed: intent.sizingParams?.riskFixed,
        fixedQty: intent.sizingParams?.fixedQty,
        leverage,
        entryPrice: intent.entryPrice,
        stopLoss: intent.stopLoss,
        balance: intent.balance ?? 0,
    });
}

// Step 4: Risk check (placeholder for Phase 7 kill switch / position cap)
async function riskCheck(_intent: OrderIntent, qty: number): Promise<void> {
    if (qty <= 0) throw OmsError.sizing(`computed qty=${qty} is not positive`);
}

// Step 5: Resolve credentials
async function resolveCredentials(intent: OrderIntent): Promise<BrokerCredentials | null> {
    if (intent.broker === BrokerType.PAPER) return null;
    if (!intent.brokerCredentialId) throw OmsError.credential('no credential id');

    const full = await credentialVault.retrieveById(intent.brokerCredentialId);
    if (!full) throw OmsError.credential('credentials not found or decrypt failed');

    // BrokerCredentials is the shape consumed by brokerAdapters. Pull the
    // fields they need; downstream code (MT5 / Indian brokers) will need
    // richer credential access in later phases.
    return {
        id: full.id,
        userId: full.userId,
        broker: full.broker,
        apiKey: full.apiKey ?? '',
        apiSecret: full.apiSecret ?? '',
    };
}

// Step 6: Insert signal_executions row with status='Pending'
async function insertPendingExecution(intent: OrderIntent, _qty: number): Promise<SignalExecutionRow> {
    const { data, error } = await supabaseAdmin
        .from('signal_executions')
        .insert({
            signal_id: intent.signalId,
            watchlist_strategy_id: intent.watchlistStrategyId,
            user_id: intent.userId,
            symbol: intent.symbol,
            market: intent.market,
            direction: intent.direction,
            entry_price: intent.entryPrice,
            timeframe: intent.timeframe,
            stop_loss: intent.stopLoss,
            take_profit: intent.takeProfit,
            lot_size: intent.riskSettings.lotSize ?? null,
            leverage: intent.riskSettings.leverage ?? null,
            status: 'Pending',
            broker: intent.broker,
        })
        .select('*')
        .single();

    if (error || !data) {
        throw OmsError.db(`insert signal_executions failed: ${error?.message || 'no data'}`);
    }
    return data as SignalExecutionRow;
}

// Step 9: Mark execution Active or Rejected
async function finalizeExecution(execId: string, outcome: 'Active' | 'Rejected', rejectedReason?: string): Promise<void> {
    const update: Record<string, unknown> = { status: outcome, updated_at: new Date().toISOString() };
    if (outcome === 'Rejected' && rejectedReason) {
        update.close_reason = rejectedReason;
    }
    const { error } = await supabaseAdmin.from('signal_executions').update(update).eq('id', execId);
    if (error) console.error('[oms] finalizeExecution failed:', error.message);
}

export const oms = {
    async submit(rawIntent: OrderIntent): Promise<SignalExecutionRow> {
        const intent = normalize(rawIntent);             // Step 2
        validateIntent(intent);                          // Step 1

        const qty = resolveQty(intent);                  // Step 3
        await riskCheck(intent, qty);                    // Step 4
        const creds = await resolveCredentials(intent);  // Step 5
        const exec = await insertPendingExecution(intent, qty); // Step 6

        const adapter = getBrokerAdapter(intent.broker);
        const bracket: BracketInput = {
            symbol: intent.symbol,
            side: intent.direction === TradeDirection.BUY ? 'BUY' : 'SELL',
            qty,
            entryType: intent.entryType,
            entryPrice: intent.entryPrice,
            stopLoss: intent.stopLoss,
            takeProfit: intent.takeProfit,
        };

        let result;
        try {
            result = await adapter.submitBracket(bracket, creds);  // Step 7
        } catch (err: any) {
            await finalizeExecution(exec.id, 'Rejected', err?.message || 'adapter threw');
            throw OmsError.broker(err?.message || 'adapter threw');
        }

        // Step 8: Insert broker_orders rows
        for (const leg of result.legs) {
            await insertBrokerOrder({
                executionId: exec.id,
                userId: intent.userId,
                broker: intent.broker,
                symbol: intent.symbol,
                side: bracket.side,
                leg,
            });
        }

        // Step 9: Activate
        const hasRejectedLeg = result.legs.some((l) => l.status === 'Rejected');
        await finalizeExecution(exec.id, hasRejectedLeg ? 'Rejected' : 'Active', result.rejectedReason);

        // Return the final row
        const { data: finalRow } = await supabaseAdmin
            .from('signal_executions')
            .select('*')
            .eq('id', exec.id)
            .single();
        return (finalRow || exec) as SignalExecutionRow;
    },
};
