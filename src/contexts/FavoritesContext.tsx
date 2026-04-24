// src/contexts/FavoritesContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loadFavorites, addFavorite, removeFavorite } from '../services/favoritesService';

interface FavoritesContextValue {
    favorites: Set<string>;
    isFavorite: (symbol: string) => boolean;
    toggleFavorite: (symbol: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [favorites, setFavorites] = useState<Set<string>>(new Set());

    useEffect(() => {
        let cancelled = false;
        loadFavorites().then((list) => {
            if (!cancelled) setFavorites(new Set(list));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const isFavorite = useCallback((symbol: string) => favorites.has(symbol), [favorites]);

    const toggleFavorite = useCallback(
        async (symbol: string) => {
            const wasFav = favorites.has(symbol);

            // Optimistic update
            setFavorites((prev) => {
                const next = new Set(prev);
                if (wasFav) next.delete(symbol);
                else next.add(symbol);
                return next;
            });

            try {
                if (wasFav) {
                    await removeFavorite(symbol);
                } else {
                    await addFavorite(symbol);
                }
            } catch (error) {
                // Revert on failure
                setFavorites((prev) => {
                    const next = new Set(prev);
                    if (wasFav) next.add(symbol);
                    else next.delete(symbol);
                    return next;
                });
                console.error('Toggle favorite failed:', error);
            }
        },
        [favorites]
    );

    return (
        <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
            {children}
        </FavoritesContext.Provider>
    );
};

export const useFavorites = (): FavoritesContextValue => {
    const ctx = useContext(FavoritesContext);
    if (!ctx) {
        throw new Error('useFavorites must be used within FavoritesProvider');
    }
    return ctx;
};
