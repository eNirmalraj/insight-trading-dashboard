import { supabase } from './supabaseClient';
import { Watchlist, WatchlistItem, AccountType } from '../types';

export interface DbWatchlist {
    id: string;
    user_id: string;
    name: string;
    account_type: string;
    strategy_type: string | null;
    trading_mode: string;
    is_auto_trade_enabled: boolean;
    created_at: string;
    updated_at: string;
    // Risk Management
    lot_size: number;
    risk_percent: number;
    leverage: number;
    stop_loss_distance: number;
    take_profit_distance: number;
    trailing_stop_loss_distance: number;
    execution_timeframes: string[] | null;
    manual_risk_enabled: boolean;
    market_type: string | null;
    risk_method: string | null;
    auto_leverage_enabled: boolean;
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
    lot_size: number;
    risk_percent: number;
    take_profit_distance: number;
    stop_loss_distance: number;
    trailing_stop_loss_distance: number;
    leverage: number;
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
    // Risk Management Settings (Deprecated on item level, but kept for compatibility/overrides if needed)
    lot_size: Number(item.lot_size) || 0.01,
    risk_percent: Number(item.risk_percent) || 1.0,
    take_profit_distance: Number(item.take_profit_distance) || 0,
    stop_loss_distance: Number(item.stop_loss_distance) || 0,
    trailing_stop_loss_distance: Number(item.trailing_stop_loss_distance) || 0,
    leverage: Number(item.leverage) || 1,
});

/**
 * Convert DB watchlist with items to frontend Watchlist type
 */
const mapDbToWatchlist = (
    row: DbWatchlist,
    items: DbWatchlistItem[]
): Watchlist => {
    let accountType: AccountType = AccountType.FOREX;
    if (row.account_type === 'crypto') accountType = AccountType.CRYPTO;
    else if (row.account_type === 'indian') accountType = AccountType.INDIAN;

    return {
        id: row.id,
        name: row.name,
        accountType: accountType,
        strategyType: row.strategy_type ?? undefined,
        tradingMode: (row.trading_mode as 'paper' | 'live') || 'paper',
        items: items.map(mapDbItemToWatchlistItem),
        isMasterAutoTradeEnabled: row.is_auto_trade_enabled ?? false,
        // Global Risk Settings
        lotSize: Number(row.lot_size) || 0.01,
        riskPercent: Number(row.risk_percent) || 1.0,
        leverage: Number(row.leverage) || 1,
        stopLossDistance: Number(row.stop_loss_distance) || 0,
        takeProfitDistance: Number(row.take_profit_distance) || 0,
        trailingStopLossDistance: Number(row.trailing_stop_loss_distance) || 0,
        executionTimeframes: row.execution_timeframes || [],
        manualRiskEnabled: row.manual_risk_enabled ?? false,
        marketType: (row.market_type as 'spot' | 'futures') || undefined,
        riskMethod: (row.risk_method as 'fixed' | 'percent') || 'fixed',
        autoLeverageEnabled: row.auto_leverage_enabled ?? false,
    };
};

// --- Service Functions ---

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
    accountType: AccountType | 'Forex' | 'Crypto' | string,
    strategyType: string,
    tradingMode: 'paper' | 'live' = 'paper',
    executionTimeframes?: string[],
    marketType?: 'spot' | 'futures',
    riskMethod?: 'fixed' | 'percent',
    autoLeverageEnabled?: boolean
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
            trading_mode: tradingMode,
            is_auto_trade_enabled: false,
            // Defaults will be handled by DB or explicit here
            lot_size: 0.01,
            risk_percent: 1.0,
            leverage: 1,
            stop_loss_distance: 0,
            take_profit_distance: 0,
            trailing_stop_loss_distance: 0,
            execution_timeframes: executionTimeframes || null,
            manual_risk_enabled: false,
            market_type: marketType || null,
            risk_method: riskMethod || 'fixed',
            auto_leverage_enabled: autoLeverageEnabled || false
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
    payload: {
        name?: string;
        strategyType?: string;
        tradingMode?: 'paper' | 'live';
        // Risk Settings
        lotSize?: number;
        riskPercent?: number;
        leverage?: number;
        stopLossDistance?: number;
        takeProfitDistance?: number;
        trailingStopLossDistance?: number;
        executionTimeframes?: string[];
        manualRiskEnabled?: boolean;
        marketType?: 'spot' | 'futures';
        riskMethod?: 'fixed' | 'percent';
        autoLeverageEnabled?: boolean;
    }
): Promise<Watchlist | undefined> => {
    if (!supabase) throw new Error('Supabase not configured');

    const updateData: Record<string, unknown> = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.strategyType !== undefined) updateData.strategy_type = payload.strategyType;
    if (payload.tradingMode !== undefined) updateData.trading_mode = payload.tradingMode;

    // Risk Settings Updates
    if (payload.lotSize !== undefined) updateData.lot_size = payload.lotSize;
    if (payload.riskPercent !== undefined) updateData.risk_percent = payload.riskPercent;
    if (payload.leverage !== undefined) updateData.leverage = payload.leverage;
    if (payload.stopLossDistance !== undefined) updateData.stop_loss_distance = payload.stopLossDistance;
    if (payload.takeProfitDistance !== undefined) updateData.take_profit_distance = payload.takeProfitDistance;
    if (payload.trailingStopLossDistance !== undefined) updateData.trailing_stop_loss_distance = payload.trailingStopLossDistance;
    if (payload.executionTimeframes !== undefined) updateData.execution_timeframes = payload.executionTimeframes;
    if (payload.manualRiskEnabled !== undefined) updateData.manual_risk_enabled = payload.manualRiskEnabled;
    if (payload.marketType !== undefined) updateData.market_type = payload.marketType;
    if (payload.riskMethod !== undefined) updateData.risk_method = payload.riskMethod;
    if (payload.autoLeverageEnabled !== undefined) updateData.auto_leverage_enabled = payload.autoLeverageEnabled;

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

/**
 * Update risk settings for a watchlist item
 * @deprecated Moved to global watchlist settings. Kept for backward compat or item-level config in future.
 */
export const updateWatchlistItemRiskSettings = async (
    itemId: string,
    settings: {
        lot_size?: number;
        risk_percent?: number;
        take_profit_distance?: number;
        stop_loss_distance?: number;
        trailing_stop_loss_distance?: number;
        leverage?: number;
    }
): Promise<{ success: boolean }> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { error } = await supabase
        .from('watchlist_items')
        .update(settings)
        .eq('id', itemId);

    if (error) throw new Error(error.message);

    return { success: true };
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
    updateWatchlistItemRiskSettings
};
