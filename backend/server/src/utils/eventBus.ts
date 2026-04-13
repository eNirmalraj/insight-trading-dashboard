// backend/server/src/utils/eventBus.ts
import { EventEmitter } from 'events';
import { Candle } from '../engine/indicators';

export enum EngineEvents {
    CANDLE_CLOSED = 'candleClosed',
    PRICE_TICK = 'priceTick',
    SIGNAL_CREATED = 'signalCreated',
    SIGNAL_STATUS_CHANGED = 'signalStatusChanged',
}

/**
 * Event payloads (subscribers can import these for type safety).
 */
export interface CandleClosedPayload {
    symbol: string;
    timeframe: string;
    candle: Candle;
}

export interface PriceTickPayload {
    symbol: string;
    bid: number;
    ask: number;
    ts: number;
}

export interface SignalCreatedPayload {
    signal: any; // SignalRow — kept loose to avoid circular imports with signalStorage
    triggered_by: 'candle' | 'cold_start' | 'replay';
}

class EventBus extends EventEmitter {
    public emitCandleClosed(symbol: string, timeframe: string, candle: Candle) {
        this.emit(EngineEvents.CANDLE_CLOSED, { symbol, timeframe, candle });
    }

    public emitPriceTick(symbol: string, bid: number, ask: number) {
        this.emit(EngineEvents.PRICE_TICK, { symbol, bid, ask, ts: Date.now() });
    }

    public emitSignalCreated(signal: any, triggeredBy: 'candle' | 'cold_start' | 'replay' = 'candle') {
        this.emit(EngineEvents.SIGNAL_CREATED, { signal, triggered_by: triggeredBy });
    }

    public emitSignalStatusChanged(signalId: string, status: string) {
        this.emit(EngineEvents.SIGNAL_STATUS_CHANGED, { signalId, status });
    }
}

export const eventBus = new EventBus();
