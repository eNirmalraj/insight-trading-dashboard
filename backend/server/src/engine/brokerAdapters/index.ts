// backend/server/src/engine/brokerAdapters/index.ts
// Registry of broker adapters keyed by BrokerType.

import { BrokerType } from '../../constants/enums';
import { BrokerAdapter } from './types';
import { paperBrokerAdapter } from './paperBroker';
import { binanceBrokerAdapter } from './binanceBroker';

const adapters: Record<string, BrokerAdapter> = {
    [BrokerType.PAPER]: paperBrokerAdapter,
    [BrokerType.BINANCE]: binanceBrokerAdapter,
};

export function getBrokerAdapter(broker: string): BrokerAdapter {
    return adapters[broker] || adapters[BrokerType.PAPER];
}

// Legacy compatibility: the existing executionEngine.handleNewSignal still
// calls brokerAdapters.execute(exec) and .onClose(exec). Keep these shims
// for the brief window before Task 11 rewires the caller to use OMS directly.
// After Task 11 ships, remove these shims.
export const brokerAdapters = {
    async execute(exec: any): Promise<void> {
        console.log(`[brokerAdapters.execute] (shim) broker=${exec?.broker}`);
    },
    async onClose(exec: any): Promise<void> {
        console.log(`[brokerAdapters.onClose] (shim) broker=${exec?.broker}`);
    },
};
