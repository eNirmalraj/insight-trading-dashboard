// backend/server/src/engine/brokerAdapters/paperBroker.ts
// Default broker. Paper trades exist as signal_executions rows — no external calls.

import { SignalExecutionRow } from '../../services/executionStorage';

export const paperBrokerAdapter = {
    async execute(execution: SignalExecutionRow): Promise<void> {
        console.log(
            `[PaperBroker] Open ${execution.direction} ${execution.symbol} ` +
            `entry=${execution.entry_price} sl=${execution.stop_loss} tp=${execution.take_profit}`,
        );
    },

    async onClose(execution: SignalExecutionRow): Promise<void> {
        console.log(
            `[PaperBroker] Close ${execution.symbol} ` +
            `reason=${execution.close_reason} price=${execution.close_price} pnl=${execution.profit_loss}`,
        );
    },
};
