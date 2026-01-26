// backend/server/src/utils/eventBus.ts
import { EventEmitter } from 'events';
import { Candle } from '../engine/indicators';

export enum EngineEvents {
    CANDLE_CLOSED = 'candleClosed',
    PRICE_TICK = 'priceTick',
    SIGNAL_CREATED = 'signalCreated',
    SIGNAL_STATUS_CHANGED = 'signalStatusChanged',
}

class EventBus extends EventEmitter {
    public emitCandleClosed(symbol: string, timeframe: string, candle: Candle) {
        this.emit(EngineEvents.CANDLE_CLOSED, { symbol, timeframe, candle });
    }

    public emitPriceTick(symbol: string, price: number) {
        this.emit(EngineEvents.PRICE_TICK, { symbol, price });
    }

    public emitSignalCreated(signalId: string, signalData: any) {
        this.emit(EngineEvents.SIGNAL_CREATED, { signalId, signalData });
    }

    public emitSignalStatusChanged(signalId: string, status: string) {
        this.emit(EngineEvents.SIGNAL_STATUS_CHANGED, { signalId, status });
    }
}

export const eventBus = new EventBus();
