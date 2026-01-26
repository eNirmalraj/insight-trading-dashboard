// src/engine/alertEngine.ts
import { PriceAlert, Drawing, TrendLineDrawing, RayDrawing, HorizontalLineDrawing, HorizontalRayDrawing, ParallelChannelDrawing, FibonacciRetracementDrawing, RectangleDrawing } from '../components/market-chart/types';
import { marketRealtimeService } from '../services/marketRealtimeService';
import { getAlerts, markTriggered, subscribe as subscribeToAlerts, saveAlert } from '../services/alertService';
import { evaluateExpression, EvaluationContext } from './expressionEvaluator';

class AlertEngine {
    private activeAlerts: PriceAlert[] = [];
    private subscribedSymbols: Set<string> = new Set();
    private isRunning: boolean = false;

    // In-memory lock to prevent double triggering locally before DB update confirms
    private processingAlerts: Set<string> = new Set();

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[AlertEngine] Starting...');
        await this.reloadAlerts();
    }

    public stop() {
        this.isRunning = false;
        this.activeAlerts = [];
        this._unsubscribeAll();
        console.log('[AlertEngine] Stopped.');
    }

    public async reloadAlerts() {
        if (!this.isRunning) return;

        // Fetch active alerts from DB
        const alerts = await getAlerts();
        this.activeAlerts = alerts;

        this._updateSubscriptions();
    }

    private _updateSubscriptions() {
        const neededSymbols = new Set(this.activeAlerts.map(a => a.symbol.toLowerCase()));

        // Unsubscribe from symbols no longer needed
        for (const symbol of this.subscribedSymbols) {
            if (!neededSymbols.has(symbol)) {
                marketRealtimeService.unsubscribeFromTicker(symbol, this._handleTick);
                this.subscribedSymbols.delete(symbol);
            }
        }

        // Subscribe to new symbols
        for (const symbol of neededSymbols) {
            if (!this.subscribedSymbols.has(symbol)) {
                marketRealtimeService.subscribeToTicker(symbol, this._handleTick);
                this.subscribedSymbols.add(symbol);
            }
        }
    }

    private _unsubscribeAll() {
        for (const symbol of this.subscribedSymbols) {
            marketRealtimeService.unsubscribeFromTicker(symbol, this._handleTick);
        }
        this.subscribedSymbols.clear();
    }

    private _handleTick = async (data: { price: number; change: number; changePercent: number; volume: number }) => {
        // Ticker callbacks don't provide symbol directly in the data arg structure defined in marketRealtimeService types?
        // Wait, looking at marketRealtimeService.ts:
        // type TickerCallback = (data: { price: number; changePercent: number; volume: number; change: number }) => void;
        // The callback doesn't receive the symbol. This is a limitation of the current service signature.
        // I need to know which symbol updated.

        // FIX: The current service design requires passing a closure that knows the symbol, 
        // OR the service needs to pass the symbol.
        // Since I'm using a single handler method `_handleTick`, I can't know the symbol unless I change the service signature 
        // OR I create a wrapper for each subscription.

        // Let's check `marketRealtimeService.ts` again. 
        // calls: cbs?.forEach(cb => cb({ price, changePercent, volume: baseVolume, change }));

        // I will bind the symbol to the handler when subscribing.
    };

    // Correct approach ensuring we capture symbol context
    // We'll wrap the subscription to include symbol
    // Override _updateSubscriptions logic to bind symbol
}

// Re-implementing with correct binding
class StatefulAlertEngine {
    private activeAlerts: PriceAlert[] = [];
    private drawings: Drawing[] = []; // Store drawings for geometric evaluation
    private activeSubscriptions: Map<string, (data: any) => void> = new Map();
    private isRunning: boolean = false;
    private processingAlerts: Set<string> = new Set(); // Prevent race conditions
    private unsubscribeAlerts: (() => void) | null = null;

    // Indicator Alert Support
    private indicatorValues: Map<string, Record<string, number | null>> = new Map();
    private previousIndicatorValues: Map<string, Record<string, number | null>> = new Map();
    private indicatorDefinitions: Map<string, any> = new Map(); // Stores indicator JSON with alertConditions

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[AlertEngine] Starting...');

        // Subscribe to alert changes (creation/deletion/update)
        this.unsubscribeAlerts = subscribeToAlerts(() => {
            console.log('[AlertEngine] Alerts changed, reloading...');
            this.reloadAlerts();
        });

        await this.reloadAlerts();
    }

    public setDrawings(drawings: Drawing[]) {
        this.drawings = drawings;
    }

    /**
     * Update indicator values for alert evaluation
     * Called by CandlestickChart when indicators recalculate
     */
    public setIndicatorValues(indicatorId: string, values: Record<string, number | null>) {
        // Store previous values for crossover detection
        const current = this.indicatorValues.get(indicatorId);
        if (current) {
            this.previousIndicatorValues.set(indicatorId, { ...current });
        }

        // Update current values
        this.indicatorValues.set(indicatorId, values);
    }

    /**
     * Register an indicator's definition (including alertConditions)
     * Called when an indicator with alertConditions is loaded
     */
    public setIndicatorDefinition(indicatorId: string, definition: any) {
        this.indicatorDefinitions.set(indicatorId, definition);
    }

    public stop() {
        this.isRunning = false;
        this.activeAlerts = [];
        this._unsubscribeAll();
        if (this.unsubscribeAlerts) {
            this.unsubscribeAlerts();
            this.unsubscribeAlerts = null;
        }
        console.log('[AlertEngine] Stopped.');
    }

    public async reloadAlerts() {
        if (!this.isRunning) return;

        try {
            const alerts = await getAlerts();
            this.activeAlerts = alerts;
            this._updateSubscriptions();
        } catch (error) {
            console.error('[AlertEngine] Failed to reload alerts:', error);
        }
    }

    private _updateSubscriptions() {
        const neededSymbols = new Set(this.activeAlerts.map(a => a.symbol.toUpperCase()));

        // Cleanup old
        for (const [symbol, callback] of this.activeSubscriptions) {
            if (!neededSymbols.has(symbol)) {
                marketRealtimeService.unsubscribeFromTicker(symbol, callback);
                this.activeSubscriptions.delete(symbol);
            }
        }

        // Add new
        for (const symbol of neededSymbols) {
            if (!this.activeSubscriptions.has(symbol)) {
                const callback = (data: { price: number }) => this._evaluate(symbol, data.price);
                this.activeSubscriptions.set(symbol, callback);
                marketRealtimeService.subscribeToTicker(symbol, callback);
            }
        }
    }

    private _unsubscribeAll() {
        for (const [symbol, callback] of this.activeSubscriptions) {
            marketRealtimeService.unsubscribeFromTicker(symbol, callback);
        }
        this.activeSubscriptions.clear();
    }


    private getPriceAtTime(drawing: Drawing, time: number): number | null {
        if (!drawing) return null;

        if (drawing.type === 'Horizontal Line') {
            return (drawing as HorizontalLineDrawing).price;
        }

        if (drawing.type === 'Horizontal Ray') {
            const d = drawing as HorizontalRayDrawing;
            if (!d.start) return null;
            if (time >= d.start.time) return d.start.price;
            return null;
        }

        if (drawing.type === 'Trend Line' || drawing.type === 'Ray') {
            const d = drawing as TrendLineDrawing | RayDrawing;
            if (!d.start || !d.end) return null;

            // Strict time bounds for Trend Line (segment)
            if (drawing.type === 'Trend Line') {
                const minTime = Math.min(d.start.time, d.end.time);
                const maxTime = Math.max(d.start.time, d.end.time);
                // Allow a small buffer or strict? Strict for now.
                if (time < minTime || time > maxTime) return null;
            } else {
                // Ray: strict start time check (extends infinitely to right)
                if (time < d.start.time) return null;
            }

            const dt = d.end.time - d.start.time;
            const dp = d.end.price - d.start.price;

            if (dt === 0) return null; // Vertical line case, ignore for price alert

            const slope = dp / dt;
            const timeDelta = time - d.start.time;
            return d.start.price + (slope * timeDelta);
        }

        // Parallel Channel, Rect, Fib - handled differently or later
        return null;
    }

    private getPriceRangeAtTime(drawing: Drawing, time: number): { min: number, max: number } | null {
        if (drawing.type === 'Rectangle') {
            const d = drawing as RectangleDrawing;
            const minTime = Math.min(d.start.time, d.end.time);
            const maxTime = Math.max(d.start.time, d.end.time);

            if (time < minTime || time > maxTime) return null;

            return {
                min: Math.min(d.start.price, d.end.price),
                max: Math.max(d.start.price, d.end.price)
            };
        }

        if (drawing.type === 'Parallel Channel') {
            const d = drawing as ParallelChannelDrawing;
            // Main line (P1 -> P2 in types structure might be Start/End?)
            // Type says: start, end, p2.
            // Usually Start->End is the center or one side. P2 defines the width.
            // Let's assume Start->End is one edge, and P2 is a point on the other edge.

            // Check time bounds
            const minTime = Math.min(d.start.time, d.end.time);
            const maxTime = Math.max(d.start.time, d.end.time);
            // Infinite extension? Parallel channels usually act like trendlines (rays or segments).
            // Assuming segment for now unless extended.
            if (time < minTime || time > maxTime) return null;

            const dt = d.end.time - d.start.time;
            const dp = d.end.price - d.start.price;

            if (dt === 0) return null;

            const slope = dp / dt;
            const tDelta = time - d.start.time;

            // Price on main line
            const price1 = d.start.price + (slope * tDelta);

            // Price on parallel line
            // Parallel line passes through P2 and has same slope.
            // P2.time might not be at `time`.
            // Intercept difference?
            // Line 1: y - y1 = m(x - x1) => y = mx - mx1 + y1
            // Line 2: y - y2 = m(x - x2) => y = mx - mx2 + y2
            // Vertical distance at any x is constant? No, vertical dist is constant.
            // Vertical offset at x2: y1_at_x2 = ...
            // Let's just project P2 using slope.
            // y2_at_time = P2.price + slope * (time - P2.time)

            const price2 = d.p2.price + (slope * (time - d.p2.time));

            return {
                min: Math.min(price1, price2),
                max: Math.max(price1, price2)
            };
        }

        return null;
    }

    private lastPrices: Map<string, number> = new Map(); // Store previous price per symbol
    private lastBarMinutes: Map<string, number> = new Map();
    private lastBarClosePrices: Map<string, number> = new Map();

    private async _evaluate(symbol: string, currentPrice: number) {
        if (!this.isRunning) return;

        // Get previous price for this symbol (Last Tick)
        const prevPrice = this.lastPrices.get(symbol);

        // Update last price immediately for next tick
        this.lastPrices.set(symbol, currentPrice);

        // --- BAR CLOSE LOGIC ---
        const nowMinute = Math.floor(Date.now() / 60000); // 1-minute bars
        let lastMinute = this.lastBarMinutes.get(symbol);

        if (lastMinute === undefined) {
            // First tick seen for this symbol. Initialize state.
            // We use 'currentPrice' as a temporary 'baseline' so that if the bar closes 
            // and crosses a level relative to where we started, we capture it.
            this.lastBarMinutes.set(symbol, nowMinute);
            this.lastBarClosePrices.set(symbol, currentPrice);
            lastMinute = nowMinute;
        }

        if (nowMinute > lastMinute) {
            // A bar has closed!
            // 'prevPrice' is the last tick of the completed bar (effectively the Close).
            // We use 'prevPrice' as the confirmed Close Price of the bar that just ended.
            const closedBarPrice = prevPrice !== undefined ? prevPrice : currentPrice;
            const previousClosedBarPrice = this.lastBarClosePrices.get(symbol); // Close of bar-2

            // Filter for Bar Close Alerts Only
            const barCloseAlerts = this.activeAlerts.filter(a =>
                a.symbol.toUpperCase() === symbol.toUpperCase() &&
                !a.triggered &&
                a.triggerFrequency === 'Once Per Bar Close'
            );

            for (const alert of barCloseAlerts) {
                // Evaluate using confirmed Closed prices
                this._evaluateAlert(alert, symbol, closedBarPrice, previousClosedBarPrice);
            }

            // Update state
            this.lastBarClosePrices.set(symbol, closedBarPrice);
            this.lastBarMinutes.set(symbol, nowMinute);
        }

        // --- STANDARD REAL-TIME LOGIC ---
        // Filter out 'Once Per Bar Close' alerts to avoid duplicates/wrong time triggers
        const standardAlerts = this.activeAlerts.filter(a =>
            a.symbol.toUpperCase() === symbol.toUpperCase() &&
            !a.triggered &&
            a.triggerFrequency !== 'Once Per Bar Close'
        );

        for (const alert of standardAlerts) {
            this._evaluateAlert(alert, symbol, currentPrice, prevPrice);
        }
    }

    private async _evaluateAlert(alert: PriceAlert, symbol: string, currentPrice: number, prevPrice: number | undefined) {
        if (this.processingAlerts.has(alert.id)) return;

        // console.log(`[AlertEngine] Evaluating ${alert.symbol}: Price ${currentPrice} vs Target ${alert.value} (${alert.condition})`);

        let shouldTrigger = false;
        const now = Date.now();

        // === INDICATOR ALERT EVALUATION ===
        if (alert.indicatorId && alert.alertConditionId) {
            const indicatorDef = this.indicatorDefinitions.get(alert.indicatorId);
            const currentIndicatorValues = this.indicatorValues.get(alert.indicatorId);

            if (!indicatorDef || !currentIndicatorValues) {
                // Indicator not loaded yet or no values available
                return;
            }

            // Find the alert condition definition in the indicator's JSON
            const alertCondition = indicatorDef.alertConditions?.find(
                (ac: any) => ac.id === alert.alertConditionId
            );

            if (!alertCondition) {
                console.warn(`[AlertEngine] Alert condition ${alert.alertConditionId} not found in indicator ${alert.indicatorId}`);
                return;
            }

            // Build evaluation context
            const context: EvaluationContext = {
                indicatorValues: currentIndicatorValues,
                priceData: {
                    open: currentPrice, // We don't have OHLC from ticker, use close for all
                    high: currentPrice,
                    low: currentPrice,
                    close: currentPrice,
                },
                previousIndicatorValues: this.previousIndicatorValues.get(alert.indicatorId),
                previousPriceData: prevPrice ? {
                    open: prevPrice,
                    high: prevPrice,
                    low: prevPrice,
                    close: prevPrice,
                } : undefined,
                parameters: alert.conditionParameters,
            };

            // Evaluate expression
            try {
                shouldTrigger = evaluateExpression(alertCondition.expression, context);
                // console.log(`[AlertEngine] Indicator alert ${alert.id}: expression="${alertCondition.expression}" result=${shouldTrigger}`);
            } catch (error) {
                console.error(`[AlertEngine] Error evaluating indicator alert:`, error);
                return;
            }

            // Skip to frequency check (indicator alerts don't use standard conditions below)
        }

        // === STANDARD PRICE/DRAWING ALERT EVALUATION ===
        // Only evaluate if not an indicator alert
        if (!alert.indicatorId) {
            if (alert.condition === 'Greater Than') {
                if (!alert.drawingId && alert.value !== undefined && currentPrice > alert.value) shouldTrigger = true;
            } else if (alert.condition === 'Less Than') {
                if (!alert.drawingId && alert.value !== undefined && currentPrice < alert.value) shouldTrigger = true;
            } else if (alert.condition === 'Crossing') {
                if (!alert.drawingId && alert.value !== undefined && prevPrice !== undefined) {
                    const wasBelow = prevPrice < alert.value;
                    const isAbove = currentPrice >= alert.value;
                    const wasAbove = prevPrice > alert.value;
                    const isBelow = currentPrice <= alert.value;
                    if ((wasBelow && isAbove) || (wasAbove && isBelow)) shouldTrigger = true;
                }
            } else if (alert.condition === 'Crossing Up') {
                if (!alert.drawingId && alert.value !== undefined && prevPrice !== undefined) {
                    if (prevPrice < alert.value && currentPrice >= alert.value) shouldTrigger = true;
                }
            } else if (alert.condition === 'Crossing Down') {
                if (!alert.drawingId && alert.value !== undefined && prevPrice !== undefined) {
                    if (prevPrice > alert.value && currentPrice <= alert.value) shouldTrigger = true;
                }
            }

            // --- DYNAMIC DRAWING CHECK ---
            if (alert.drawingId && !shouldTrigger) {
                const drawing = this.drawings.find(d => d.id === alert.drawingId);
                if (drawing) {
                    const evalTime = Math.floor(now / 1000); // Seconds
                    const targetPrice = this.getPriceAtTime(drawing, evalTime);

                    if (targetPrice !== null) {
                        if (alert.condition === 'Crossing') {
                            if (prevPrice !== undefined) {
                                const wasBelow = prevPrice < targetPrice;
                                const isAbove = currentPrice >= targetPrice;
                                const wasAbove = prevPrice > targetPrice;
                                const isBelow = currentPrice <= targetPrice;
                                if ((wasBelow && isAbove) || (wasAbove && isBelow)) shouldTrigger = true;
                            }
                        } else if (alert.condition === 'Crossing Up') {
                            if (prevPrice !== undefined) {
                                const wasBelow = prevPrice < targetPrice;
                                const isAbove = currentPrice >= targetPrice;
                                if (wasBelow && isAbove) shouldTrigger = true;
                            }
                        } else if (alert.condition === 'Crossing Down') {
                            if (prevPrice !== undefined) {
                                const wasAbove = prevPrice > targetPrice;
                                const isBelow = currentPrice <= targetPrice;
                                if (wasAbove && isBelow) shouldTrigger = true;
                            }
                        } else if (alert.condition === 'Greater Than') {
                            if (currentPrice > targetPrice) shouldTrigger = true;
                        } else if (alert.condition === 'Less Than') {
                            if (currentPrice < targetPrice) shouldTrigger = true;
                        }
                    }

                    // Check Channel / Range conditions
                    if (!shouldTrigger && (alert.condition === 'Entering Channel' || alert.condition === 'Exiting Channel')) {
                        const range = this.getPriceRangeAtTime(drawing, evalTime);
                        if (range && prevPrice !== undefined) {
                            const isInside = currentPrice >= range.min && currentPrice <= range.max;
                            const wasInside = prevPrice >= range.min && prevPrice <= range.max;

                            if (alert.condition === 'Entering Channel') {
                                if (!wasInside && isInside) shouldTrigger = true;
                            } else if (alert.condition === 'Exiting Channel') {
                                if (wasInside && !isInside) shouldTrigger = true;
                            }
                        }
                    }
                }
            }

            if (shouldTrigger) {
                // Check Frequency Logic
                const lastTrigger = alert.lastTriggeredAt || 0;
                let actualTrigger = false;
                let shouldDisable = false;

                if (alert.triggerFrequency === 'Only Once') {
                    actualTrigger = true;
                    shouldDisable = true;
                } else if (alert.triggerFrequency === 'Once Per Minute') {
                    if (now - lastTrigger >= 60000) {
                        actualTrigger = true;
                    }
                } else if (alert.triggerFrequency === 'Once Per Bar') {
                    if (now - lastTrigger >= 60000) {
                        actualTrigger = true;
                    }
                } else if (alert.triggerFrequency === 'Once Per Bar Close') {
                    // Always trigger here because we are only called on Bar Close boundary
                    actualTrigger = true;
                }

                if (actualTrigger) {
                    console.log(`[AlertEngine] Triggering alert ${alert.id} for ${symbol} @ ${currentPrice}`);
                    this.processingAlerts.add(alert.id);

                    if (shouldDisable) {
                        alert.triggered = true;
                    }
                    alert.lastTriggeredAt = now;

                    if (alert.playSound) {
                        try {
                            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const oscillator = audioCtx.createOscillator();
                            const gainNode = audioCtx.createGain();

                            oscillator.connect(gainNode);
                            gainNode.connect(audioCtx.destination);

                            oscillator.type = 'sine';
                            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
                            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

                            oscillator.start();
                            oscillator.stop(audioCtx.currentTime + 0.5); // Beep for 0.5s
                        } catch (e) {
                            console.error('[AlertEngine] Failed to play sound', e);
                        }
                    }

                    this.saveTriggerState(alert);

                    this.processingAlerts.delete(alert.id);

                    if (shouldDisable) {
                        this.activeAlerts = this.activeAlerts.filter(a => a.id !== alert.id);
                    }
                }
            }
        }
    } // End of standard price/drawing alert evaluation

    private async saveTriggerState(alert: PriceAlert) {
        try {
            await saveAlert(alert);
        } catch (error) {
            console.error('[AlertEngine] Failed to save alert state:', error);
        }
    }
}


export const alertEngine = new StatefulAlertEngine();
