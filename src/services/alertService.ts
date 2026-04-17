import { db } from './supabaseClient';
import { PriceAlert, AlertConditionType, Drawing, HorizontalLineDrawing, HorizontalRayDrawing, TrendLineDrawing, VerticalLineDrawing } from '../components/market-chart/types';

export const isMockMode = import.meta.env.VITE_USE_MOCK_API === 'true';

// Mock Store
let mockAlerts: PriceAlert[] = [];

// UI Support
type Listener = () => void;
const listeners: Set<Listener> = new Set();

export const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const notifyListeners = () => {
    listeners.forEach((l) => l());
};

const mapDbRowToAlert = (row: any): PriceAlert => ({
    id: row.id,
    symbol: row.symbol ? row.symbol.toUpperCase() : '',
    condition: row.condition as AlertConditionType,
    value: Number(row.price),
    triggered: row.triggered,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    lastTriggeredAt: row.triggered_at ? new Date(row.triggered_at).getTime() : undefined,
    message: row.message || `Price ${row.condition} ${row.price}`,
    notifyApp: row.notify_app ?? true,
    playSound: row.play_sound ?? true,
    triggerFrequency: row.trigger_frequency || 'Only Once',
    drawingId: row.drawing_id,
    fibLevel: row.fib_level ? Number(row.fib_level) : undefined,
    // Indicator Alert Fields
    indicatorId: row.indicator_id,
    alertConditionId: row.alert_condition_id,
    conditionParameters: row.condition_parameters,
    timeframe: row.timeframe || '1m',
});

export const getAlerts = async (): Promise<PriceAlert[]> => {
    if (isMockMode) {
        return Promise.resolve([...mockAlerts]);
    }

    try {
        const { data, error } = await db()
            .from('price_alerts')
            .select('*')
            //.eq('triggered', false) // UI might want to see history? User "Load active (untriggered)" for engine.
            // Services usually return valid data. Let's return only active for now to match engine, or all?
            // "getAlerts()" in engine uses this. Engine wants active.
            // SidePanels might want history.
            // Best to default to active for now, or all and let filter?
            // Existing impl filtered for "triggered: false" in previous iterations.
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(mapDbRowToAlert);
    } catch (error) {
        console.error('Failed to fetch alerts:', error);
        return [];
    }
};

export const createAlert = async (alertData: Partial<PriceAlert>): Promise<PriceAlert | null> => {
    const symbol = alertData.symbol?.toUpperCase() || '';
    const condition = alertData.condition || 'Greater Than';
    const price = alertData.value !== undefined ? Number(alertData.value) : 0;

    const newAlertObj: PriceAlert = {
        id: isMockMode ? `mock_${Date.now()}` : '',
        symbol,
        condition,
        value: price,
        triggered: false,
        createdAt: Date.now(),
        message: alertData.message || `Price ${condition} ${price}`,
        notifyApp: alertData.notifyApp ?? true,
        playSound: alertData.playSound ?? true,
        triggerFrequency: alertData.triggerFrequency || 'Only Once',
        drawingId: alertData.drawingId,
    };

    if (isMockMode) {
        mockAlerts.push(newAlertObj);
        notifyListeners();
        return Promise.resolve(newAlertObj);
    }

    try {
        const { data, error } = await db()
            .from('price_alerts')
            .insert([
                {
                    symbol,
                    condition,
                    price,
                    triggered: false,
                    drawing_id: alertData.drawingId,
                    fib_level: alertData.fibLevel,
                    message: alertData.message,
                    notify_app: alertData.notifyApp,
                    play_sound: alertData.playSound,
                    trigger_frequency: alertData.triggerFrequency,
                    // Indicator Alert Fields
                    indicator_id: alertData.indicatorId,
                    alert_condition_id: alertData.alertConditionId,
                    condition_parameters: alertData.conditionParameters,
                    timeframe: alertData.timeframe || '1m',
                },
            ])
            .select()
            .single();

        if (error) throw error;

        notifyListeners();
        return mapDbRowToAlert(data);
    } catch (error) {
        console.error('Failed to create alert:', error);
        window.alert(`Failed to create alert: ${(error as any).message || 'Unknown error'}`);
        return null;
    }
};

// Adapter for legacy saveAlert (likely used by UI)
export const saveAlert = async (alert: PriceAlert): Promise<PriceAlert[]> => {
    await createAlert(alert);
    return getAlerts();
};

export const deleteAlert = async (id: string): Promise<boolean> => {
    if (isMockMode) {
        mockAlerts = mockAlerts.filter((a) => a.id !== id);
        notifyListeners();
        return Promise.resolve(true);
    }

    try {
        const { error } = await db().from('price_alerts').delete().eq('id', id);

        if (error) throw error;

        notifyListeners();
        return true;
    } catch (error) {
        console.error('Failed to delete alert:', error);
        return false;
    }
};

// ... deleteAlert impl

export const updateAlert = async (
    id: string,
    updates: Partial<PriceAlert>
): Promise<PriceAlert | null> => {
    if (isMockMode) {
        const index = mockAlerts.findIndex((a) => a.id === id);
        if (index > -1) {
            mockAlerts[index] = { ...mockAlerts[index], ...updates };
            notifyListeners();
            return Promise.resolve(mockAlerts[index]);
        }
        return Promise.resolve(null);
    }

    try {
        const { data, error } = await db()
            .from('price_alerts')
            .update({
                symbol: updates.symbol,
                condition: updates.condition,
                price: updates.value !== undefined ? updates.value : undefined,
                triggered: updates.triggered,
                message: updates.message,
                notify_app: updates.notifyApp,
                play_sound: updates.playSound,
                trigger_frequency: updates.triggerFrequency,
                fib_level: updates.fibLevel,
                indicator_id: updates.indicatorId,
                alert_condition_id: updates.alertConditionId,
                condition_parameters: updates.conditionParameters,
                timeframe: updates.timeframe,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        notifyListeners();
        return mapDbRowToAlert(data);
    } catch (error) {
        console.error('Failed to update alert:', error);
        return null;
    }
};

export const markTriggered = async (id: string): Promise<boolean> => {
    // ...
    if (isMockMode) {
        const index = mockAlerts.findIndex((a) => a.id === id);
        if (index > -1) {
            mockAlerts[index].triggered = true;
            mockAlerts[index].lastTriggeredAt = Date.now();
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    try {
        const { error } = await db()
            .from('price_alerts')
            .update({
                triggered: true,
                triggered_at: new Date().toISOString(),
            })
            .eq('id', id);

        if (error) throw error;
        notifyListeners();
        return true;
    } catch (error) {
        console.error('Failed to mark alert as triggered:', error);
        return false;
    }
};

/**
 * One-click alert creation with smart defaults.
 * Extracts price from drawing, sets sensible defaults.
 */
export const createAlertWithDefaults = async (
    symbol: string,
    drawing?: Drawing,
    indicatorId?: string,
    indicatorType?: string,
    alertConditionId?: string,
    conditionParameters?: Record<string, any>,
    /** For pure price alerts (no drawing) */
    rawPrice?: number,
    /** Chart timeframe at creation (e.g. '1m', '5m', '1h') */
    timeframe: string = '1m',
): Promise<PriceAlert | null> => {
    let condition: AlertConditionType = 'Crossing';
    let price = rawPrice || 0;
    let drawingId: string | undefined;
    let targetTime: number | undefined;

    if (drawing) {
        drawingId = drawing.id;
        switch (drawing.type) {
            case 'Horizontal Line':
                price = (drawing as HorizontalLineDrawing).price;
                break;
            case 'Horizontal Ray':
                price = (drawing as HorizontalRayDrawing).start.price;
                break;
            case 'Trend Line':
                price = (drawing as TrendLineDrawing).end.price;
                break;
            case 'Parallel Channel':
                condition = 'Entering Channel';
                break;
            case 'Vertical Line':
                condition = 'Time Reached';
                targetTime = (drawing as VerticalLineDrawing).time;
                price = 0;
                break;
        }
    }

    const priceStr = price ? price.toFixed(5) : '';
    let message = '';
    if (indicatorType && alertConditionId) {
        message = `${symbol} ${indicatorType} alert`;
    } else if (drawing?.type === 'Vertical Line') {
        const date = targetTime ? new Date(targetTime * 1000).toLocaleString() : '';
        message = `${symbol} Time Reached ${date}`;
    } else if (drawing?.type === 'Parallel Channel') {
        message = `${symbol} ${condition} ${drawing.type}`;
    } else if (drawing) {
        message = `${symbol} ${condition} ${drawing.type} (${priceStr})`;
    } else {
        message = `${symbol} Price ${condition} ${priceStr}`;
    }

    // For Vertical Line, store targetTime in `value` field (repurposed as Unix seconds)
    const alertValue = targetTime !== undefined ? targetTime : (price || undefined);

    return createAlert({
        symbol,
        condition,
        value: alertValue,
        drawingId,
        message,
        notifyApp: true,
        playSound: false,
        triggerFrequency: 'Only Once',
        indicatorId,
        alertConditionId,
        conditionParameters,
        timeframe,
    });
};
