/**
 * Settings Service
 * Handles user settings sync between localStorage and Supabase
 */
import { supabase } from './supabaseClient';

/**
 * Get favorite timeframes for a user from Supabase
 */
export const getFavoriteTimeframesFromDB = async (userId: string): Promise<string[]> => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('settings')
            .eq('id', userId)
            .single();

        if (error) throw error;

        const settings = data?.settings as any;
        return settings?.favoriteTimeframes || ['1H', '4H'];
    } catch (e) {
        console.error('[SettingsService] Error fetching favorite timeframes:', e);
        return ['1H', '4H']; // Default fallback
    }
};

/**
 * Save favorite timeframes for a user to Supabase
 */
export const saveFavoriteTimeframesToDB = async (userId: string, timeframes: string[]): Promise<boolean> => {
    try {
        // First get existing settings
        const { data: existing } = await supabase
            .from('profiles')
            .select('settings')
            .eq('id', userId)
            .single();

        const currentSettings = (existing?.settings as any) || {};

        // Merge with new favorite timeframes
        const updatedSettings = {
            ...currentSettings,
            favoriteTimeframes: timeframes
        };

        const { error } = await supabase
            .from('profiles')
            .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
            .eq('id', userId);

        if (error) throw error;

        console.log(`[SettingsService] Saved favorite timeframes to DB: ${timeframes.join(', ')}`);
        return true;
    } catch (e) {
        console.error('[SettingsService] Error saving favorite timeframes:', e);
        return false;
    }
};

/**
 * Sync favorites from localStorage to Supabase
 * Call this on login/page load when user is authenticated
 */
export const syncFavoritesToDB = async (userId: string): Promise<void> => {
    try {
        const stored = localStorage.getItem('favoriteTimeframes');
        if (stored) {
            const timeframes = JSON.parse(stored);
            if (Array.isArray(timeframes) && timeframes.length > 0) {
                await saveFavoriteTimeframesToDB(userId, timeframes);
            }
        }
    } catch (e) {
        console.error('[SettingsService] Error syncing favorites to DB:', e);
    }
};

/**
 * Load favorites from Supabase to localStorage
 * Call this on login to restore user preferences
 */
export const loadFavoritesFromDB = async (userId: string): Promise<string[]> => {
    try {
        const timeframes = await getFavoriteTimeframesFromDB(userId);
        localStorage.setItem('favoriteTimeframes', JSON.stringify(timeframes));
        console.log(`[SettingsService] Loaded favorites from DB: ${timeframes.join(', ')}`);
        return timeframes;
    } catch (e) {
        console.error('[SettingsService] Error loading favorites from DB:', e);
        return ['1H', '4H'];
    }
};
