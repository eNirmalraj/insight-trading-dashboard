import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Drawing } from '../types/market';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// In-memory mock storage
let mockDrawings: Record<string, Drawing[]> = {};

const getMockKey = (symbol: string, timeframe: string) => `${symbol}:GLOBAL`;

// We use 'GLOBAL' to ensure drawings persist across all timeframes for a symbol
const GLOBAL_TIMEFRAME = 'GLOBAL';

export const loadDrawings = async (symbol: string, timeframe: string): Promise<Drawing[]> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        const key = getMockKey(symbol, GLOBAL_TIMEFRAME);
        return mockDrawings[key] || [];
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('user_chart_drawings')
            .select('drawing_data')
            .eq('user_id', user.id)
            .eq('symbol', symbol)
            .eq('timeframe', GLOBAL_TIMEFRAME) // Always load GLOBAL
            .single();

        if (error) {
            if (error.code !== 'PGRST116') { // Ignore no rows found
                console.error('Error loading drawings:', error);
            }
            return [];
        }

        // drawing_data is stored as JSONB, which Supabase returns as object/array
        return (data?.drawing_data as unknown as Drawing[]) || [];
    } catch (error) {
        console.error('Failed to load drawings:', error);
        return [];
    }
};

export const saveDrawings = async (symbol: string, timeframe: string, drawings: Drawing[]): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        const key = getMockKey(symbol, GLOBAL_TIMEFRAME);
        mockDrawings[key] = drawings;
        return;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Optimized: Store all drawings for this view in one row
        const { error } = await supabase
            .from('user_chart_drawings')
            .upsert({
                user_id: user.id,
                symbol: symbol,
                timeframe: GLOBAL_TIMEFRAME, // Always save to GLOBAL
                drawing_type: 'collection', // Meta-type since we store full array
                drawing_data: drawings,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, symbol, timeframe'
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving drawings:', error);
    }
};

export const clearDrawings = async (symbol: string, timeframe: string): Promise<void> => {
    return saveDrawings(symbol, GLOBAL_TIMEFRAME, []);
};
