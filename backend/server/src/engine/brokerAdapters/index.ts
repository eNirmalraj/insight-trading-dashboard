// backend/server/src/engine/brokerAdapters/index.ts
// Routes execution events to the correct broker adapter.

import { SignalExecutionRow } from '../../services/executionStorage';
import { BrokerType } from '../../constants/enums';
import { paperBrokerAdapter } from './paperBroker';

export interface BrokerAdapter {
    execute(execution: SignalExecutionRow): Promise<void>;
    onClose(execution: SignalExecutionRow): Promise<void>;
}

const adapters: Record<string, BrokerAdapter> = {
    [BrokerType.PAPER]: paperBrokerAdapter,
    // Future: [BrokerType.BINANCE]: binanceBrokerAdapter,
};

export const brokerAdapters = {
    async execute(exec: SignalExecutionRow): Promise<void> {
        const adapter = adapters[exec.broker] || adapters[BrokerType.PAPER];
        await adapter.execute(exec);
    },

    async onClose(exec: SignalExecutionRow): Promise<void> {
        const adapter = adapters[exec.broker] || adapters[BrokerType.PAPER];
        await adapter.onClose(exec);
    },
};
