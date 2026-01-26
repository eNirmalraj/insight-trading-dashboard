// Indicator Service
// Handles CRUD operations for technical indicators with Supabase persistence

import { supabase } from './supabaseClient';
import { Indicator, IndicatorType, IndicatorSettings } from '../components/market-chart/types';

export interface UserIndicator {
    id: string;
    user_id: string;
    symbol: string;
    timeframe: string;
    indicator_type: IndicatorType;
    settings: IndicatorSettings;
    is_visible: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
}

/**
 * Fetch all indicators for a specific symbol and timeframe
 */
export const fetchUserIndicators = async (
    symbol: string,
    timeframe: string
): Promise<Indicator[]> => {
    try {
        const { data, error } = await supabase
            .from('user_indicators')
            .select('*')
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .order('display_order', { ascending: true });

        if (error) throw error;

        // Convert DB format to Indicator format
        return (data || []).map(dbIndicator => ({
            id: dbIndicator.id,
            type: dbIndicator.indicator_type as IndicatorType,
            settings: dbIndicator.settings,
            data: {}, // Data will be calculated client-side
            isVisible: dbIndicator.is_visible
        }));
    } catch (error) {
        console.error('Error fetching indicators:', error);
        return [];
    }
};

/**
 * Save a new indicator to the database
 */
export const saveIndicator = async (
    symbol: string,
    timeframe: string,
    indicator: Omit<Indicator, 'data'>
): Promise<Indicator | null> => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // Get current max display_order
        const { data: existingIndicators } = await supabase
            .from('user_indicators')
            .select('display_order')
            .eq('symbol', symbol)
            .eq('timeframe', timeframe)
            .order('display_order', { ascending: false })
            .limit(1);

        const maxOrder = existingIndicators?.[0]?.display_order ?? -1;

        const { data, error } = await supabase
            .from('user_indicators')
            .insert({
                user_id: user.id,
                symbol,
                timeframe,
                indicator_type: indicator.type,
                settings: indicator.settings,
                is_visible: indicator.isVisible,
                display_order: maxOrder + 1
            })
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            type: data.indicator_type as IndicatorType,
            settings: data.settings,
            data: {},
            isVisible: data.is_visible
        };
    } catch (error) {
        console.error('Error saving indicator:', error);
        return null;
    }
};

/**
 * Update an existing indicator's settings
 */
export const updateIndicator = async (
    id: string,
    updates: Partial<Pick<Indicator, 'settings' | 'isVisible'>>
): Promise<boolean> => {
    try {
        const updateData: any = {};
        if (updates.settings !== undefined) updateData.settings = updates.settings;
        if (updates.isVisible !== undefined) updateData.is_visible = updates.isVisible;

        const { error } = await supabase
            .from('user_indicators')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating indicator:', error);
        return false;
    }
};

/**
 * Delete an indicator
 */
export const deleteIndicator = async (id: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('user_indicators')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting indicator:', error);
        return false;
    }
};

/**
 * Update display order for multiple indicators (batch)
 */
export const updateIndicatorOrder = async (
    indicators: Array<{ id: string; display_order: number }>
): Promise<boolean> => {
    try {
        // Update each indicator's display order
        const updates = indicators.map(({ id, display_order }) =>
            supabase
                .from('user_indicators')
                .update({ display_order })
                .eq('id', id)
        );

        const results = await Promise.all(updates);

        // Check if any failed
        const hasError = results.some(result => result.error);
        if (hasError) {
            console.error('Some indicators failed to update order');
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error updating indicator order:', error);
        return false;
    }
};

/**
 * Toggle visibility for a single indicator
 */
export const toggleIndicatorVisibility = async (
    id: string,
    isVisible: boolean
): Promise<boolean> => {
    return updateIndicator(id, { isVisible });
};

/**
 * Delete all indicators for a symbol/timeframe combination
 */
export const clearAllIndicators = async (
    symbol: string,
    timeframe: string
): Promise<boolean> => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { error } = await supabase
            .from('user_indicators')
            .delete()
            .eq('user_id', user.id)
            .eq('symbol', symbol)
            .eq('timeframe', timeframe);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error clearing indicators:', error);
        return false;
    }
};

export default {
    fetchUserIndicators,
    saveIndicator,
    updateIndicator,
    deleteIndicator,
    updateIndicatorOrder,
    toggleIndicatorVisibility,
    clearAllIndicators
};
