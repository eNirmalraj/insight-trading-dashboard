// src/services/marketStateService.ts
import { db, isSupabaseConfigured } from './supabaseClient';
import type {
    ChartSettings,
    SymbolSettings,
    ScalesAndLinesSettings,
    StatusLineSettings,
} from '../components/market-chart/types';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// Default state
const DEFAULT_MARKET_STATE = {
    symbol: 'BTCUSDT.P',
    timeframe: '1H',
};

// In-memory mock storage
// In-memory mock storage
let mockMarketState = { ...DEFAULT_MARKET_STATE };
let mockChartSettings: any = {};

export interface MarketState {
    symbol: string;
    timeframe: string;
}

export const loadMarketState = async (): Promise<MarketState> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Promise.resolve({ ...mockMarketState });
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return DEFAULT_MARKET_STATE;

        const { data, error } = await db()
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
            timeframe: data.timeframe || DEFAULT_MARKET_STATE.timeframe,
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
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return;

        const { error } = await db().from('user_market_state').upsert({
            user_id: user.id,
            symbol: state.symbol,
            timeframe: state.timeframe,
            updated_at: new Date().toISOString(),
        });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving market state:', error);
    }
};

/**
 * Normalise persisted SymbolSettings by filling in missing fields with defaults.
 * Handles forward-compatibility with rows saved before new fields were added.
 */
export function normaliseSymbolSettings(
    raw: any,
    defaults: SymbolSettings
): SymbolSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        candleBodyWidth: typeof raw.candleBodyWidth === 'number'
            ? raw.candleBodyWidth
            : defaults.candleBodyWidth,
        showLastPriceLine: typeof raw.showLastPriceLine === 'boolean'
            ? raw.showLastPriceLine
            : defaults.showLastPriceLine,
    };
}

export function normaliseScalesAndLinesSettings(
    raw: any,
    defaults: ScalesAndLinesSettings
): ScalesAndLinesSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        scaleType:
            raw.scaleType === 'Linear' ||
            raw.scaleType === 'Logarithmic' ||
            raw.scaleType === 'Percent'
                ? raw.scaleType
                : defaults.scaleType,
        reverseScale:
            typeof raw.reverseScale === 'boolean' ? raw.reverseScale : defaults.reverseScale,
        lockPriceToBarRatio:
            typeof raw.lockPriceToBarRatio === 'boolean'
                ? raw.lockPriceToBarRatio
                : defaults.lockPriceToBarRatio,
        showPrevDayCloseLine: typeof raw.showPrevDayCloseLine === 'boolean'
            ? raw.showPrevDayCloseLine
            : defaults.showPrevDayCloseLine,
        showAverageCloseLine: typeof raw.showAverageCloseLine === 'boolean'
            ? raw.showAverageCloseLine
            : defaults.showAverageCloseLine,
        showHighLowMarkers: typeof raw.showHighLowMarkers === 'boolean'
            ? raw.showHighLowMarkers
            : defaults.showHighLowMarkers,
    };
}

export function normaliseStatusLineSettings(
    raw: any,
    defaults: StatusLineSettings
): StatusLineSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        showOhlc: typeof raw.showOhlc === 'boolean' ? raw.showOhlc : defaults.showOhlc,
        showBarChange: typeof raw.showBarChange === 'boolean' ? raw.showBarChange : defaults.showBarChange,
        showVolume: typeof raw.showVolume === 'boolean' ? raw.showVolume : defaults.showVolume,
        showIndicatorTitles: typeof raw.showIndicatorTitles === 'boolean' ? raw.showIndicatorTitles : defaults.showIndicatorTitles,
        showIndicatorValues: typeof raw.showIndicatorValues === 'boolean' ? raw.showIndicatorValues : defaults.showIndicatorValues,
        showBarChangePercent: typeof raw.showBarChangePercent === 'boolean' ? raw.showBarChangePercent : defaults.showBarChangePercent,
        showMarketStatus: typeof raw.showMarketStatus === 'boolean' ? raw.showMarketStatus : defaults.showMarketStatus,
    };
}

/**
 * Normalise a full ChartSettings payload by running the sub-normalisers.
 * Future sub-projects can extend this with more sub-shape normalisers.
 */
export function normaliseChartSettings(
    raw: any,
    defaults: ChartSettings
): ChartSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        symbol: normaliseSymbolSettings(raw.symbol, defaults.symbol),
        scalesAndLines: normaliseScalesAndLinesSettings(raw.scalesAndLines, defaults.scalesAndLines),
        statusLine: normaliseStatusLineSettings(raw.statusLine, defaults.statusLine),
    };
}

export const loadChartSettings = async (): Promise<ChartSettings | null> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Object.keys(mockChartSettings).length > 0 ? mockChartSettings : null;
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return null;

        const { data, error } = await db()
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
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return;

        const { error } = await db().from('user_chart_settings').upsert({
            user_id: user.id,
            settings_json: settings,
            updated_at: new Date().toISOString(),
        });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving chart settings:', error);
    }
};
