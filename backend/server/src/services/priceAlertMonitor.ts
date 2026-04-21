// backend/server/src/services/priceAlertMonitor.ts
import { supabaseAdmin } from './supabaseAdmin';
import { eventBus, EngineEvents, PriceTickPayload } from '../utils/eventBus';
import { binanceStream } from './binanceStream';

const POLL_INTERVAL = 5000;

interface ActiveAlert {
    id: string;
    symbol: string;
    condition: string;
    price: number | null;
    trigger_frequency: string;
    triggered_at: string | null;
    indicator_id: string | null;
    alert_condition_id: string | null;
    condition_parameters: any;
    timeframe: string | null;
}

function timeframeToMs(timeframe?: string | null): number {
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

const latestPrices: Map<string, number> = new Map();
const previousPrices: Map<string, number> = new Map();

let pollTimer: NodeJS.Timeout | null = null;
let isRunning = false;

function checkCondition(
    condition: string,
    currentPrice: number,
    prevPrice: number | undefined,
    targetPrice: number
): boolean {
    switch (condition) {
        case 'Greater Than':
            return currentPrice > targetPrice;
        case 'Less Than':
            return currentPrice < targetPrice;
        case 'Crossing':
            return prevPrice !== undefined &&
                ((prevPrice < targetPrice && currentPrice >= targetPrice) ||
                 (prevPrice > targetPrice && currentPrice <= targetPrice));
        case 'Crossing Up':
            return prevPrice !== undefined && prevPrice < targetPrice && currentPrice >= targetPrice;
        case 'Crossing Down':
            return prevPrice !== undefined && prevPrice > targetPrice && currentPrice <= targetPrice;
        default:
            return false;
    }
}

async function evaluateAlerts() {
    if (!isRunning) return;

    try {
        const { data: alerts, error } = await supabaseAdmin
            .from('price_alerts')
            .select('id, symbol, condition, price, trigger_frequency, triggered_at, indicator_id, alert_condition_id, condition_parameters, timeframe')
            .eq('triggered', false)
            .is('drawing_id', null)
            .is('indicator_id', null);

        if (error || !alerts) return;

        for (const alert of alerts as ActiveAlert[]) {
            const sym = alert.symbol.toUpperCase();
            const current = latestPrices.get(sym);
            const prev = previousPrices.get(sym);

            if (current === undefined || alert.price === null) continue;

            binanceStream.ensureKlineStream(sym);

            const triggered = checkCondition(alert.condition, current, prev, alert.price);
            if (!triggered) continue;

            const now = Date.now();
            const lastTriggered = alert.triggered_at ? new Date(alert.triggered_at).getTime() : 0;
            let shouldFire = false;
            let shouldDisable = false;

            switch (alert.trigger_frequency) {
                case 'Only Once':
                    shouldFire = true;
                    shouldDisable = true;
                    break;
                case 'Once Per Minute':
                    shouldFire = now - lastTriggered >= 60_000;
                    break;
                case 'Once Per Bar':
                case 'Once Per Bar Close':
                    shouldFire = now - lastTriggered >= timeframeToMs(alert.timeframe);
                    break;
            }

            if (shouldFire) {
                console.log(`[PriceAlertMonitor] Triggered: ${alert.id} ${sym} ${alert.condition} ${alert.price}`);

                await supabaseAdmin
                    .from('price_alerts')
                    .update({
                        triggered: shouldDisable,
                        triggered_at: new Date().toISOString(),
                    })
                    .eq('id', alert.id);
            }
        }
    } catch (err) {
        console.error('[PriceAlertMonitor] Evaluation error:', err);
    }
}

function handlePriceTick(payload: PriceTickPayload) {
    const sym = payload.symbol.toUpperCase();
    const current = latestPrices.get(sym);
    if (current !== undefined) {
        previousPrices.set(sym, current);
    }
    latestPrices.set(sym, (payload.bid + payload.ask) / 2);
}

export function startPriceAlertMonitor() {
    if (isRunning) return;
    isRunning = true;

    eventBus.on(EngineEvents.PRICE_TICK, handlePriceTick);
    pollTimer = setInterval(evaluateAlerts, POLL_INTERVAL);

    console.log('[PriceAlertMonitor] Started (poll every 5s)');
}

export function stopPriceAlertMonitor() {
    isRunning = false;
    eventBus.off(EngineEvents.PRICE_TICK, handlePriceTick);
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    console.log('[PriceAlertMonitor] Stopped');
}
