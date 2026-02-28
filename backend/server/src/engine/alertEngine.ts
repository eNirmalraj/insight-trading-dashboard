// backend/server/src/engine/alertEngine.ts
// Alert Engine — Uses @insight/computation for alert condition checking.

import { supabaseAdmin } from '../services/supabaseAdmin';
import { eventBus, EngineEvents } from '../utils/eventBus';
import { Candle } from '@insight/types';
import { checkPriceAlert } from '@insight/computation';

interface Alert {
    id: string;
    user_id: string;
    symbol: string;
    condition: string;
    price: number;
    triggered: boolean;
    message?: string;
    trigger_frequency?: string;
    last_triggered_at?: string;
    indicator_id?: string;
    alert_condition_id?: string;
    condition_parameters?: any;
}

const activeAlerts: Map<string, Alert[]> = new Map();
// Track previous prices for crossing detection
const previousPrices: Map<string, number> = new Map();

export const initAlertEngine = async () => {
    console.log('[AlertEngine] Starting...');
    await loadActiveAlerts();

    eventBus.on(EngineEvents.CANDLE_CLOSED, async ({ symbol, candle }: { symbol: string, candle: Candle }) => {
        await checkAlerts(symbol, candle.close);
    });

    eventBus.on('PRICE_TICK', async ({ symbol, price }: { symbol: string, price: number }) => {
        await checkAlerts(symbol, price);
    });

    setInterval(loadActiveAlerts, 60000);
    console.log('[AlertEngine] Started.');
};

const loadActiveAlerts = async () => {
    try {
        const { data, error } = await supabaseAdmin
            .from('price_alerts')
            .select('*')
            .eq('triggered', false);

        if (error) throw error;

        activeAlerts.clear();
        data?.forEach((alert: Alert) => {
            const list = activeAlerts.get(alert.symbol) || [];
            list.push(alert);
            activeAlerts.set(alert.symbol, list);
        });
    } catch (e) {
        console.error('[AlertEngine] Failed to load alerts:', e);
    }
};

const checkAlerts = async (symbol: string, currentPrice: number) => {
    const alerts = activeAlerts.get(symbol);
    if (!alerts || alerts.length === 0) return;

    const prevPrice = previousPrices.get(symbol);

    for (const alert of alerts) {
        if (alert.indicator_id) {
            continue; // Indicator alerts handled separately
        }

        // Use shared computation for alert checking
        const result = checkPriceAlert(
            { condition: alert.condition, price: alert.price },
            currentPrice,
            prevPrice
        );

        if (result.triggered) {
            await triggerAlert(alert, currentPrice);
        }
    }

    // Track previous price for crossing detection
    previousPrices.set(symbol, currentPrice);
};

const triggerAlert = async (alert: Alert, price: number) => {
    console.log(`[AlertEngine] 🔔 ALERT TRIGGERED: ${alert.symbol} ${alert.condition} ${alert.price} (Current: ${price})`);

    if (alert.trigger_frequency === 'Only Once') {
        const { error } = await supabaseAdmin
            .from('price_alerts')
            .update({
                triggered: true,
                triggered_at: new Date().toISOString()
            })
            .eq('id', alert.id);

        if (error) console.error('[AlertEngine] Failed to update alert status:', error);

        const list = activeAlerts.get(alert.symbol) || [];
        activeAlerts.set(alert.symbol, list.filter(a => a.id !== alert.id));
    } else {
        await supabaseAdmin
            .from('price_alerts')
            .update({ last_triggered_at: new Date().toISOString() })
            .eq('id', alert.id);
    }
};
