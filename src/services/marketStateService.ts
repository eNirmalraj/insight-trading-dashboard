// src/services/marketStateService.ts
import { db, isSupabaseConfigured } from './supabaseClient';
import type {
    ChartSettings,
    CanvasSettings,
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

    // One-shot migration for rows written before the grid/crosshair V/H split.
    // Safe to delete once persisted rows have re-saved under the new shape.
    const legacyGrid = typeof raw.gridColor === 'string' ? raw.gridColor : null;
    const legacyCross = typeof raw.crosshairColor === 'string' ? raw.crosshairColor : null;
    const { gridColor: _g, crosshairColor: _c, ...rest } = raw;

    const isLineStyle = (v: unknown): v is 'solid' | 'dashed' | 'dotted' =>
        v === 'solid' || v === 'dashed' || v === 'dotted';
    const isWidth = (v: unknown): v is number =>
        typeof v === 'number' && v >= 1 && v <= 3;

    return {
        ...defaults,
        ...rest,
        scaleType:
            rest.scaleType === 'Linear' ||
            rest.scaleType === 'Logarithmic' ||
            rest.scaleType === 'Percent'
                ? rest.scaleType
                : defaults.scaleType,
        reverseScale:
            typeof rest.reverseScale === 'boolean' ? rest.reverseScale : defaults.reverseScale,
        lockPriceToBarRatio:
            typeof rest.lockPriceToBarRatio === 'boolean'
                ? rest.lockPriceToBarRatio
                : defaults.lockPriceToBarRatio,
        showPrevDayCloseLine:
            typeof rest.showPrevDayCloseLine === 'boolean'
                ? rest.showPrevDayCloseLine
                : defaults.showPrevDayCloseLine,
        showAverageCloseLine:
            typeof rest.showAverageCloseLine === 'boolean'
                ? rest.showAverageCloseLine
                : defaults.showAverageCloseLine,
        showHighLowMarkers:
            typeof rest.showHighLowMarkers === 'boolean'
                ? rest.showHighLowMarkers
                : defaults.showHighLowMarkers,

        gridColorVertical:
            typeof rest.gridColorVertical === 'string'
                ? rest.gridColorVertical
                : (legacyGrid ?? defaults.gridColorVertical),
        gridColorHorizontal:
            typeof rest.gridColorHorizontal === 'string'
                ? rest.gridColorHorizontal
                : (legacyGrid ?? defaults.gridColorHorizontal),
        gridStyleVertical: isLineStyle(rest.gridStyleVertical)
            ? rest.gridStyleVertical
            : defaults.gridStyleVertical,
        gridStyleHorizontal: isLineStyle(rest.gridStyleHorizontal)
            ? rest.gridStyleHorizontal
            : defaults.gridStyleHorizontal,

        crosshairColorVertical:
            typeof rest.crosshairColorVertical === 'string'
                ? rest.crosshairColorVertical
                : (legacyCross ?? defaults.crosshairColorVertical),
        crosshairColorHorizontal:
            typeof rest.crosshairColorHorizontal === 'string'
                ? rest.crosshairColorHorizontal
                : (legacyCross ?? defaults.crosshairColorHorizontal),
        crosshairStyleVertical: isLineStyle(rest.crosshairStyleVertical)
            ? rest.crosshairStyleVertical
            : defaults.crosshairStyleVertical,
        crosshairStyleHorizontal: isLineStyle(rest.crosshairStyleHorizontal)
            ? rest.crosshairStyleHorizontal
            : defaults.crosshairStyleHorizontal,
        crosshairWidthVertical: isWidth(rest.crosshairWidthVertical)
            ? rest.crosshairWidthVertical
            : defaults.crosshairWidthVertical,
        crosshairWidthHorizontal: isWidth(rest.crosshairWidthHorizontal)
            ? rest.crosshairWidthHorizontal
            : defaults.crosshairWidthHorizontal,
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

export function normaliseCanvasSettings(
    raw: any,
    defaults: CanvasSettings
): CanvasSettings {
    if (!raw || typeof raw !== 'object') return { ...defaults };
    return {
        ...defaults,
        ...raw,
        backgroundType:
            raw.backgroundType === 'solid' || raw.backgroundType === 'gradient'
                ? raw.backgroundType
                : defaults.backgroundType,
        showWatermark:
            typeof raw.showWatermark === 'boolean' ? raw.showWatermark : defaults.showWatermark,
        watermarkFontSize:
            typeof raw.watermarkFontSize === 'number' &&
            raw.watermarkFontSize >= 12 &&
            raw.watermarkFontSize <= 96
                ? raw.watermarkFontSize
                : defaults.watermarkFontSize,
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
        canvas: normaliseCanvasSettings(raw.canvas, defaults.canvas),
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
