// src/services/watchlistService.ts
// Watchlist service with Supabase integration

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Watchlist, WatchlistItem } from '../types';

// --- Type definitions for DB rows ---
interface DbWatchlist {
    id: string;
    user_id: string;
    name: string;
    account_type: string;
    strategy_type: string | null;
    is_auto_trade_enabled: boolean;
    created_at: string;
    updated_at: string;
}

interface DbWatchlistItem {
    id: string;
    watchlist_id: string;
    symbol: string;
    price: number;
    change: number;
    percent_change: number;
    pnl: number;
    auto_trade_enabled: boolean;
    created_at: string;
    updated_at: string;
}

// --- Data Mappers ---

/**
 * Convert DB watchlist item to frontend WatchlistItem type
 */
const mapDbItemToWatchlistItem = (item: DbWatchlistItem): WatchlistItem => ({
    id: item.id,
    symbol: item.symbol,
    price: Number(item.price) || 0,
    change: Number(item.change) || 0,
    changePercent: Number(item.percent_change) || 0,
    isPositive: Number(item.change) >= 0,
    autoTradeEnabled: item.auto_trade_enabled ?? false,
    pnl: item.pnl != null ? Number(item.pnl) : undefined,
});

/**
 * Convert DB watchlist with items to frontend Watchlist type
 */
const mapDbToWatchlist = (
    row: DbWatchlist,
    items: DbWatchlistItem[]
): Watchlist => ({
    id: row.id,
    name: row.name,
    accountType: row.account_type === 'crypto' ? 'Crypto' : 'Forex',
    strategyType: row.strategy_type ?? undefined,
    items: items.map(mapDbItemToWatchlistItem),
    isMasterAutoTradeEnabled: row.is_auto_trade_enabled ?? false,
});

// --- Service Functions ---

/**
 * Get all watchlists for the current user with their items
 */
/**
 * Get all watchlists for the current user with their items
 */
export const getWatchlists = async (): Promise<Watchlist[]> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Fetch watchlists for this user only
    const { data: watchlists, error: wlError } = await supabase
        .from('watchlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (wlError) throw new Error(wlError.message);
    if (!watchlists || watchlists.length === 0) return [];

    // Fetch all items for these watchlists
    const watchlistIds = watchlists.map((wl: DbWatchlist) => wl.id);
    const { data: items, error: itemsError } = await supabase
        .from('watchlist_items')
        .select('*')
        .in('watchlist_id', watchlistIds);

    if (itemsError) throw new Error(itemsError.message);

    // Group items by watchlist_id
    const itemsByWatchlist = new Map<string, DbWatchlistItem[]>();
    (items || []).forEach((item: DbWatchlistItem) => {
        const existing = itemsByWatchlist.get(item.watchlist_id) || [];
        existing.push(item);
        itemsByWatchlist.set(item.watchlist_id, existing);
    });

    // Map to frontend types
    return watchlists.map((wl: DbWatchlist) =>
        mapDbToWatchlist(wl, itemsByWatchlist.get(wl.id) || [])
    );
};

/**
 * Create a new watchlist
 */
export const createWatchlist = async (
    name: string,
    accountType: 'Forex' | 'Crypto',
    strategyType: string
): Promise<Watchlist> => {
    if (!supabase) throw new Error('Supabase not configured');

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
        .from('watchlists')
        .insert({
            user_id: user.id,
            name,
            account_type: accountType.toLowerCase(),
            strategy_type: strategyType || null,
            is_auto_trade_enabled: false,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);

    return mapDbToWatchlist(data, []);
};

/**
 * Update a watchlist
 */
export const updateWatchlist = async (
    id: string,
    payload: { name?: string; strategyType?: string }
): Promise<Watchlist | undefined> => {
    if (!supabase) throw new Error('Supabase not configured');

    const updateData: Record<string, unknown> = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.strategyType !== undefined) updateData.strategy_type = payload.strategyType;

    const { data, error } = await supabase
        .from('watchlists')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(error.message);

    // Fetch items for this watchlist
    const { data: items } = await supabase
        .from('watchlist_items')
        .select('*')
        .eq('watchlist_id', id);

    return mapDbToWatchlist(data, items || []);
};

/**
 * Delete a watchlist
 */
export const deleteWatchlist = async (id: string): Promise<{ success: boolean }> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('watchlists')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);

    return { success: true };
};

/**
 * Add a symbol to a watchlist
 */
export const addSymbol = async (
    watchlistId: string,
    symbol: string
): Promise<Watchlist | undefined> => {
    if (!supabase) throw new Error('Supabase not configured');

    // Insert new item with ZERO defaults (realtime service will update)
    const { error: insertError } = await supabase
        .from('watchlist_items')
        .insert({
            watchlist_id: watchlistId,
            symbol,
            price: 0,
            change: 0,
            percent_change: 0,
            pnl: 0,
            auto_trade_enabled: false,
        });

    if (insertError) {
        if (insertError.code === '23505') { // Unique constraint violation
            throw new Error('Symbol already exists in this watchlist.');
        }
        throw new Error(insertError.message);
    }

    // Return updated watchlist
    const { data: watchlist, error: wlError } = await supabase
        .from('watchlists')
        .select('*')
        .eq('id', watchlistId)
        .single();

    if (wlError) throw new Error(wlError.message);

    const { data: items } = await supabase
        .from('watchlist_items')
        .select('*')
        .eq('watchlist_id', watchlistId);

    return mapDbToWatchlist(watchlist, items || []);
};

/**
 * Remove a symbol from a watchlist
 */
export const removeSymbol = async (
    watchlistId: string,
    itemId: string
): Promise<{ success: boolean }> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('watchlist_items')
        .delete()
        .eq('id', itemId);

    if (error) throw new Error(error.message);

    return { success: true };
};

/**
 * Toggle master auto-trade for a watchlist
 */
export const toggleMasterAutoTrade = async (
    watchlistId: string,
    isEnabled: boolean
): Promise<{ success: boolean }> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('watchlists')
        .update({ is_auto_trade_enabled: isEnabled })
        .eq('id', watchlistId);

    if (error) throw new Error(error.message);

    return { success: true };
};

/**
 * Toggle auto-trade for a specific item
 */
export const toggleItemAutoTrade = async (
    itemId: string,
    isEnabled: boolean
): Promise<{ success: boolean }> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('watchlist_items')
        .update({ auto_trade_enabled: isEnabled })
        .eq('id', itemId);

    if (error) throw new Error(error.message);

    return { success: true };
};

/**
 * Toggle auto-trade (unified function for both master and item)
 */
export const toggleAutoTrade = async (
    payload: { scriptId: string; itemId?: string; isEnabled: boolean } // scriptId aliased to watchlistId
): Promise<{ success: boolean }> => {
    if (payload.itemId) {
        return toggleItemAutoTrade(payload.itemId, payload.isEnabled);
    } else {
        return toggleMasterAutoTrade(payload.scriptId, payload.isEnabled);
    }
};

export default {
    getWatchlists,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
    addSymbol,
    removeSymbol,
    toggleMasterAutoTrade,
    toggleItemAutoTrade,
    toggleAutoTrade,
};
