// src/services/marketStateService.ts
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { ChartSettings } from '../components/market-chart/types';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// Default state
const DEFAULT_MARKET_STATE = {
    symbol: 'EURUSD',
    timeframe: '1H'
};

// In-memory mock storage
// In-memory mock storage
let mockMarketState = { ...DEFAULT_MARKET_STATE };
let mockChartSettings: any = {};
let mockStrategyVisibility: Record<string, boolean> = {};

export interface MarketState {
    symbol: string;
    timeframe: string;
}

export const loadMarketState = async (): Promise<MarketState> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Promise.resolve({ ...mockMarketState });
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return DEFAULT_MARKET_STATE;

        const { data, error } = await supabase
            .from('user_market_state')
            .select('symbol, timeframe')
            .eq('user_id', user.id)
            .single();

        if (error) {
            // It's normal to not have state yet
            if (error.code === 'PGRST116') return DEFAULT_MARKET_STATE;
            console.error('Error loading market state:', error);
            return DEFAULT_MARKET_STATE;
        }

        return {
            symbol: data.symbol || DEFAULT_MARKET_STATE.symbol,
            timeframe: data.timeframe || DEFAULT_MARKET_STATE.timeframe
        };
    } catch (error) {
        console.error('Failed to load market state:', error);
        return DEFAULT_MARKET_STATE;
    }
};

export const saveMarketState = async (state: MarketState): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockMarketState = { ...state };
        return Promise.resolve();
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('user_market_state')
            .upsert({
                user_id: user.id,
                symbol: state.symbol,
                timeframe: state.timeframe,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving market state:', error);
    }
};

export const loadChartSettings = async (): Promise<ChartSettings | null> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Object.keys(mockChartSettings).length > 0 ? mockChartSettings : null;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('user_chart_settings')
            .select('settings_json')
            .eq('user_id', user.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            return null;
        }

        return data.settings_json;
    } catch (error) {
        console.error('Error loading chart settings:', error);
        return null; // Fallback to default in component
    }
};

export const saveChartSettings = async (settings: ChartSettings): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockChartSettings = { ...settings };
        return Promise.resolve();
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('user_chart_settings')
            .upsert({
                user_id: user.id,
                settings_json: settings,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving chart settings:', error);
    }
};

export const loadStrategyVisibility = async (): Promise<Record<string, boolean>> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return { ...mockStrategyVisibility };
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return {};

        const { data, error } = await supabase
            .from('user_strategy_indicators')
            .select('strategy_id, is_visible')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error loading strategy visibility:', error);
            return {};
        }

        const visibility: Record<string, boolean> = {};
        data?.forEach((row: any) => {
            visibility[row.strategy_id] = row.is_visible;
        });
        return visibility;
    } catch (error) {
        console.error('Failed to load strategy visibility:', error);
        return {};
    }
};

export const saveStrategyVisibility = async (strategyId: string, isVisible: boolean): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockStrategyVisibility[strategyId] = isVisible;
        return Promise.resolve();
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('user_strategy_indicators')
            .upsert({
                user_id: user.id,
                strategy_id: strategyId,
                is_visible: isVisible,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving strategy visibility:', error);
    }
};
