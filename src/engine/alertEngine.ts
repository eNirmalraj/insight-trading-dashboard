// src/engine/alertEngine.ts
import {
    PriceAlert,
    AlertConditionType,
    Drawing,
    TrendLineDrawing,
    RayDrawing,
    HorizontalLineDrawing,
    HorizontalRayDrawing,
    ParallelChannelDrawing,
    RectangleDrawing,
    VerticalLineDrawing,
} from '../components/market-chart/types';
import { marketRealtimeService } from '../services/marketRealtimeService';
import {
    getAlerts,
    updateAlert,
    subscribe as subscribeToAlerts,
} from '../services/alertService';
import { evaluateExpression, EvaluationContext } from './expressionEvaluator';

type AlertTriggerListener = (alert: PriceAlert) => void;

class AlertEngine {
    private activeAlerts: PriceAlert[] = [];
    private drawings: Drawing[] = [];
    private activeSubscriptions: Map<string, (data: any) => void> = new Map();
    private isRunning = false;
    private processingAlerts: Set<string> = new Set();
    private unsubscribeAlerts: (() => void) | null = null;

    // Indicator support
    private indicatorValues: Map<string, Record<string, number | null>> = new Map();
    private previousIndicatorValues: Map<string, Record<string, number | null>> = new Map();
    private indicatorDefinitions: Map<string, any> = new Map();

    // Price tracking
    private lastPrices: Map<string, number> = new Map();
    // Keyed by `${symbol}:${timeframe}` to track bar boundaries per-timeframe
    private lastBarIndices: Map<string, number> = new Map();
    private lastBarClosePrices: Map<string, number> = new Map();

    /** Convert timeframe string to milliseconds. Defaults to 1 minute. */
    private timeframeToMs(timeframe?: string): number {
        if (!timeframe) return 60_000;
        const m = timeframe.match(/^(\d+)([mhdw])$/);
        if (!m) return 60_000;
        const n = parseInt(m[1], 10);
        const unit = m[2];
        if (unit === 'm') return n * 60_000;
        if (unit === 'h') return n * 3_600_000;
        if (unit === 'd') return n * 86_400_000;
        if (unit === 'w') return n * 604_800_000;
        return 60_000;
    }

    // Trigger notification listeners
    private triggerListeners: Set<AlertTriggerListener> = new Set();

    public onTrigger(listener: AlertTriggerListener): () => void {
        this.triggerListeners.add(listener);
        return () => this.triggerListeners.delete(listener);
    }

    private notifyTrigger(alert: PriceAlert) {
        this.triggerListeners.forEach((l) => l(alert));
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.unsubscribeAlerts = subscribeToAlerts(() => this.reloadAlerts());
        await this.reloadAlerts();
    }

    public stop() {
        this.isRunning = false;
        this.activeAlerts = [];
        this.unsubscribeAll();
        if (this.unsubscribeAlerts) {
            this.unsubscribeAlerts();
            this.unsubscribeAlerts = null;
        }
    }

    public setDrawings(drawings: Drawing[]) {
        this.drawings = drawings;
    }

    public setIndicatorValues(indicatorId: string, values: Record<string, number | null>) {
        const current = this.indicatorValues.get(indicatorId);
        if (current) {
            this.previousIndicatorValues.set(indicatorId, { ...current });
        }
        this.indicatorValues.set(indicatorId, values);
    }

    public setIndicatorDefinition(indicatorId: string, definition: any) {
        this.indicatorDefinitions.set(indicatorId, definition);
    }

    public async reloadAlerts() {
        if (!this.isRunning) return;
        try {
            const alerts = await getAlerts();
            this.activeAlerts = alerts.filter((a) => !a.triggered);
            this.updateSubscriptions();
        } catch (error) {
            console.error('[AlertEngine] Failed to reload:', error);
        }
    }

    private updateSubscriptions() {
        const needed = new Set(this.activeAlerts.map((a) => a.symbol.toUpperCase()));

        for (const [sym, cb] of this.activeSubscriptions) {
            if (!needed.has(sym)) {
                marketRealtimeService.unsubscribeFromTicker(sym, cb);
                this.activeSubscriptions.delete(sym);
            }
        }

        for (const sym of needed) {
            if (!this.activeSubscriptions.has(sym)) {
                const cb = (data: { price: number }) => this.evaluate(sym, data.price);
                this.activeSubscriptions.set(sym, cb);
                marketRealtimeService.subscribeToTicker(sym, cb);
            }
        }
    }

    private unsubscribeAll() {
        for (const [sym, cb] of this.activeSubscriptions) {
            marketRealtimeService.unsubscribeFromTicker(sym, cb);
        }
        this.activeSubscriptions.clear();
    }

    // ── Price extraction for drawings ──

    private getPriceAtTime(drawing: Drawing, time: number): number | null {
        if (drawing.type === 'Horizontal Line') {
            return (drawing as HorizontalLineDrawing).price;
        }
        if (drawing.type === 'Horizontal Ray') {
            const d = drawing as HorizontalRayDrawing;
            return d.start && time >= d.start.time ? d.start.price : null;
        }
        if (drawing.type === 'Trend Line' || drawing.type === 'Ray') {
            const d = drawing as TrendLineDrawing | RayDrawing;
            if (!d.start || !d.end) return null;
            const dt = d.end.time - d.start.time;
            if (dt === 0) return null;
            if (drawing.type === 'Trend Line') {
                const minT = Math.min(d.start.time, d.end.time);
                const maxT = Math.max(d.start.time, d.end.time);
                if (time < minT || time > maxT) return null;
            } else if (time < d.start.time) {
                return null;
            }
            return d.start.price + ((d.end.price - d.start.price) / dt) * (time - d.start.time);
        }
        return null;
    }

    private getPriceRangeAtTime(
        drawing: Drawing,
        time: number
    ): { min: number; max: number } | null {
        if (drawing.type === 'Rectangle') {
            const d = drawing as RectangleDrawing;
            const minT = Math.min(d.start.time, d.end.time);
            const maxT = Math.max(d.start.time, d.end.time);
            if (time < minT || time > maxT) return null;
            return {
                min: Math.min(d.start.price, d.end.price),
                max: Math.max(d.start.price, d.end.price),
            };
        }
        if (drawing.type === 'Parallel Channel') {
            const d = drawing as ParallelChannelDrawing;
            const dt = d.end.time - d.start.time;
            if (dt === 0) return null;
            const slope = (d.end.price - d.start.price) / dt;
            const tDelta = time - d.start.time;
            const p1 = d.start.price + slope * tDelta;
            const p2 = d.p2.price + slope * (time - d.p2.time);
            return { min: Math.min(p1, p2), max: Math.max(p1, p2) };
        }
        return null;
    }

    // ── Main evaluation ──

    private async evaluate(symbol: string, currentPrice: number) {
        if (!this.isRunning) return;

        const prevPrice = this.lastPrices.get(symbol);
        this.lastPrices.set(symbol, currentPrice);

        // ── Bar close detection per-timeframe ──
        // Collect unique timeframes used by bar-close alerts for this symbol
        const barCloseAlerts = this.activeAlerts.filter(
            (a) =>
                a.symbol.toUpperCase() === symbol &&
                !a.triggered &&
                a.triggerFrequency === 'Once Per Bar Close'
        );

        const timeframesSeen = new Set<string>();
        for (const a of barCloseAlerts) {
            timeframesSeen.add(a.timeframe || '1m');
        }

        for (const tf of timeframesSeen) {
            const tfMs = this.timeframeToMs(tf);
            const key = `${symbol}:${tf}`;
            const nowBar = Math.floor(Date.now() / tfMs);
            const lastBar = this.lastBarIndices.get(key);

            if (lastBar === undefined) {
                this.lastBarIndices.set(key, nowBar);
                this.lastBarClosePrices.set(key, currentPrice);
                continue;
            }

            if (nowBar > lastBar) {
                const closedPrice = prevPrice ?? currentPrice;
                const prevClosedPrice = this.lastBarClosePrices.get(key);
                for (const alert of barCloseAlerts) {
                    if ((alert.timeframe || '1m') === tf) {
                        this.evaluateAlert(alert, symbol, closedPrice, prevClosedPrice);
                    }
                }
                this.lastBarClosePrices.set(key, closedPrice);
                this.lastBarIndices.set(key, nowBar);
            }
        }

        // ── Standard alerts (non bar-close) ──
        const standardAlerts = this.activeAlerts.filter(
            (a) =>
                a.symbol.toUpperCase() === symbol &&
                !a.triggered &&
                a.triggerFrequency !== 'Once Per Bar Close'
        );
        for (const alert of standardAlerts) {
            this.evaluateAlert(alert, symbol, currentPrice, prevPrice);
        }
    }

    private async evaluateAlert(
        alert: PriceAlert,
        symbol: string,
        currentPrice: number,
        prevPrice: number | undefined
    ) {
        if (this.processingAlerts.has(alert.id)) return;

        let shouldTrigger = false;

        // ── Indicator alert ──
        if (alert.indicatorId && alert.alertConditionId) {
            const def = this.indicatorDefinitions.get(alert.indicatorId);
            const currentVals = this.indicatorValues.get(alert.indicatorId);
            if (!def || !currentVals) return;

            const alertCond = def.alertConditions?.find(
                (ac: any) => ac.id === alert.alertConditionId
            );
            if (!alertCond) return;

            const context: EvaluationContext = {
                indicatorValues: currentVals,
                priceData: { open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice },
                previousIndicatorValues: this.previousIndicatorValues.get(alert.indicatorId),
                previousPriceData: prevPrice
                    ? { open: prevPrice, high: prevPrice, low: prevPrice, close: prevPrice }
                    : undefined,
                parameters: alert.conditionParameters,
            };

            try {
                shouldTrigger = evaluateExpression(alertCond.expression, context);
            } catch {
                return;
            }
        }
        // ── Price / Drawing alert ──
        else {
            shouldTrigger = this.evaluatePriceCondition(alert, currentPrice, prevPrice);
        }

        // ── Frequency gate (applies to ALL alert types) ──
        if (shouldTrigger) {
            const now = Date.now();
            const lastTrigger = alert.lastTriggeredAt || 0;
            let actualTrigger = false;
            let shouldDisable = false;

            switch (alert.triggerFrequency) {
                case 'Only Once':
                    actualTrigger = true;
                    shouldDisable = true;
                    break;
                case 'Once Per Minute':
                    actualTrigger = now - lastTrigger >= 60_000;
                    break;
                case 'Once Per Bar':
                    // Throttle by the alert's timeframe (e.g. 5m → 5 minutes between triggers)
                    actualTrigger = now - lastTrigger >= this.timeframeToMs(alert.timeframe);
                    break;
                case 'Once Per Bar Close':
                    actualTrigger = true;
                    break;
            }

            if (actualTrigger) {
                this.processingAlerts.add(alert.id);

                if (shouldDisable) alert.triggered = true;
                alert.lastTriggeredAt = now;

                if (alert.playSound) this.playAlertSound();

                this.notifyTrigger(alert);

                try {
                    await updateAlert(alert.id, {
                        triggered: alert.triggered,
                        lastTriggeredAt: now,
                    });
                } catch (e) {
                    console.error('[AlertEngine] Failed to save trigger state:', e);
                }

                this.processingAlerts.delete(alert.id);

                if (shouldDisable) {
                    this.activeAlerts = this.activeAlerts.filter((a) => a.id !== alert.id);
                }
            }
        }
    }

    private evaluatePriceCondition(
        alert: PriceAlert,
        currentPrice: number,
        prevPrice: number | undefined
    ): boolean {
        if (!alert.drawingId) {
            return this.checkCondition(alert.condition, currentPrice, prevPrice, alert.value);
        }

        const drawing = this.drawings.find((d) => d.id === alert.drawingId);
        if (!drawing) return false;

        const evalTime = Math.floor(Date.now() / 1000);

        // Vertical Line: time-based alert — fires when evalTime reaches the line's time
        if (alert.condition === 'Time Reached' && drawing.type === 'Vertical Line') {
            const d = drawing as VerticalLineDrawing;
            return evalTime >= d.time;
        }

        if (alert.condition === 'Entering Channel' || alert.condition === 'Exiting Channel') {
            const range = this.getPriceRangeAtTime(drawing, evalTime);
            if (!range || prevPrice === undefined) return false;
            const isInside = currentPrice >= range.min && currentPrice <= range.max;
            const wasInside = prevPrice >= range.min && prevPrice <= range.max;
            return alert.condition === 'Entering Channel'
                ? !wasInside && isInside
                : wasInside && !isInside;
        }

        const targetPrice = this.getPriceAtTime(drawing, evalTime);
        if (targetPrice === null) return false;
        return this.checkCondition(alert.condition, currentPrice, prevPrice, targetPrice);
    }

    private checkCondition(
        condition: AlertConditionType,
        current: number,
        prev: number | undefined,
        target: number | undefined
    ): boolean {
        if (target === undefined) return false;
        switch (condition) {
            case 'Greater Than':
                return current > target;
            case 'Less Than':
                return current < target;
            case 'Crossing':
                return prev !== undefined &&
                    ((prev < target && current >= target) ||
                     (prev > target && current <= target));
            case 'Crossing Up':
                return prev !== undefined && prev < target && current >= target;
            case 'Crossing Down':
                return prev !== undefined && prev > target && current <= target;
            default:
                return false;
        }
    }

    private playAlertSound() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch {}
    }
}

export const alertEngine = new AlertEngine();
