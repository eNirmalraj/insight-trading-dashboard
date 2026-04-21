// backend/server/src/engine/brokerAdapters/paperBroker.ts
// Paper broker — implements the full BrokerAdapter interface.
//
// Paper orders have no broker_order_id (NULL). The "fill" for the entry
// is synthetic and happens immediately. The SL/TP legs stay Open and are
// closed by the execution engine's tick monitor, which writes a fills_log
// row when it closes an execution.

import {
    BrokerAdapter,
    BracketInput,
    BrokerCredentials,
    BracketResult,
    BrokerOrderLeg,
    FillEvent,
    BrokerPosition,
} from './types';

function legFor(
    role: 'ENTRY' | 'SL' | 'TP',
    type: BrokerOrderLeg['type'],
    status: BrokerOrderLeg['status'],
    qty: number,
    price: number | null,
    stopPrice: number | null,
): BrokerOrderLeg {
    return {
        brokerOrderId: null,
        role,
        type,
        status,
        price,
        stopPrice,
        qty,
    };
}

export const paperBrokerAdapter: BrokerAdapter = {
    async submitBracket(input: BracketInput, _creds: BrokerCredentials | null): Promise<BracketResult> {
        console.log(
            `[PaperBroker] Open ${input.side} ${input.symbol} qty=${input.qty} entry=${input.entryPrice} sl=${input.stopLoss} tp=${input.takeProfit}`,
        );
        return {
            legs: [
                legFor('ENTRY', 'MARKET', 'Filled', input.qty, input.entryPrice ?? null, null),
                legFor('SL', 'STOP_MARKET', 'Open', input.qty, null, input.stopLoss),
                legFor('TP', 'TAKE_PROFIT_MARKET', 'Open', input.qty, null, input.takeProfit),
            ],
        };
    },

    async cancelOrder(_brokerOrderId: string, _symbol: string, _creds: BrokerCredentials | null): Promise<void> {
        // No-op for paper — the engine just stops monitoring after closeExecution.
    },

    async getOpenOrders(_symbol: string, _creds: BrokerCredentials | null): Promise<BrokerOrderLeg[]> {
        return [];
    },

    async getPosition(_symbol: string, _creds: BrokerCredentials | null): Promise<BrokerPosition | null> {
        return null;
    },

    subscribeFills(_creds: BrokerCredentials | null, _onFill: (fill: FillEvent) => void): () => void {
        // Paper fills come from the execution engine's tick monitor which
        // writes fills_log directly when it closes a row. No push channel here.
        return () => {};
    },

    async ping(_creds: BrokerCredentials | null): Promise<boolean> {
        return true;
    },
};
