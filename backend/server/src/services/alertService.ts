
import { supabaseAdmin } from './supabaseAdmin';

export type AlertType = 'CREATED' | 'ACTIVATED' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL' | 'CLOSED_OTHER';

const formatMessage = (type: AlertType, symbol: string, data?: any): string => {
    switch (type) {
        case 'CREATED':
            return `New Signal: ${symbol} (${data?.direction}) at ${data?.entry_price}`;
        case 'ACTIVATED':
            return `Signal Activated: ${symbol} price reached entry`;
        case 'CLOSED_TP':
            return `Take Profit Hit: ${symbol} secured ${data?.pnl?.toFixed(2)}% profit`;
        case 'CLOSED_SL':
            return `Stop Loss Hit: ${symbol} loss ${Math.abs(data?.pnl).toFixed(2)}%`;
        case 'CLOSED_MANUAL':
            return `Signal Closed Manually: ${symbol}`;
        default:
            return `Signal Update: ${symbol}`;

    }
};

export const createAlert = async (
    signalId: string,
    type: AlertType,
    symbol: string,
    data?: any
): Promise<string | null> => {
    try {
        const message = formatMessage(type, symbol, data);

        // Check for duplicates for this signal and type (idempotency)
        // Especially for 'CREATED' and 'ACTIVATED' which should happen once
        if (type === 'CREATED' || type === 'ACTIVATED') {
            const { data: existing } = await supabaseAdmin
                .from('alerts')
                .select('id')
                .eq('signal_id', signalId)
                .eq('type', type)
                .single();

            if (existing) {
                return null; // Already alerted
            }
        }

        const { data: alert, error } = await supabaseAdmin
            .from('alerts')
            .insert({
                signal_id: signalId,
                type,
                message,
                user_id: null, // System Alert
                read: false
            })
            .select('id')
            .single();

        if (error) {
            console.error('[AlertService] Error creating alert:', error);
            return null;
        }

        console.log(`[AlertService] 🔔 Alert Created: ${message}`);
        return alert.id;

    } catch (error) {
        console.error('[AlertService] Unexpected error:', error);
        return null;
    }
};
