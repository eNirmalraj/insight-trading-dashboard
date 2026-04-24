// src/services/favoritesService.ts
import { db, isSupabaseConfigured } from './supabaseClient';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';

// In-memory mock storage
let mockFavorites = new Set<string>();

export const loadFavorites = async (): Promise<string[]> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        return Promise.resolve(Array.from(mockFavorites));
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return [];

        const { data, error } = await db()
            .from('user_favorite_symbols')
            .select('symbol')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error loading favorites:', error);
            return [];
        }

        return (data ?? []).map((row) => row.symbol);
    } catch (error) {
        console.error('Failed to load favorites:', error);
        return [];
    }
};

export const addFavorite = async (symbol: string): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockFavorites.add(symbol);
        return;
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return;

        const { error } = await db()
            .from('user_favorite_symbols')
            .upsert({ user_id: user.id, symbol });

        if (error) throw error;
    } catch (error) {
        console.error('Error adding favorite:', error);
        throw error;
    }
};

export const removeFavorite = async (symbol: string): Promise<void> => {
    if (USE_MOCK || !isSupabaseConfigured()) {
        mockFavorites.delete(symbol);
        return;
    }

    try {
        const {
            data: { user },
        } = await db().auth.getUser();
        if (!user) return;

        const { error } = await db()
            .from('user_favorite_symbols')
            .delete()
            .eq('user_id', user.id)
            .eq('symbol', symbol);

        if (error) throw error;
    } catch (error) {
        console.error('Error removing favorite:', error);
        throw error;
    }
};
