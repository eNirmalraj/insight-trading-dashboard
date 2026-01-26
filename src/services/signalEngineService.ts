// src/services/signalEngineService.ts
// Service layer for Signal Engine management and configuration

import { supabase } from './supabaseClient';
import type { EngineStatus } from '../engine/signalEngine';

export interface StrategySignalConfig {
    id: string;
    strategyId: string;
    isSignalEnabled: boolean;
    targetSymbols: string[];
    targetTimeframes: string[];
    createdAt: string;
    updatedAt: string;
}

/**
 * Get signal configuration for a specific strategy
 */
export const getStrategySignalConfig = async (strategyId: string): Promise<StrategySignalConfig | null> => {
    const { data, error } = await supabase
        .from('strategy_signal_config')
        .select('*')
        .eq('strategy_id', strategyId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No config found - return default
            return null;
        }
        throw new Error(error.message);
    }

    return {
        id: data.id,
        strategyId: data.strategy_id,
        isSignalEnabled: data.is_signal_enabled,
        targetSymbols: data.target_symbols || [],
        targetTimeframes: data.target_timeframes || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at
    };
};

/**
 * Get all strategy signal configurations
 */
export const getAllStrategySignalConfigs = async (): Promise<StrategySignalConfig[]> => {
    const { data, error } = await supabase
        .from('strategy_signal_config')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return data.map(d => ({
        id: d.id,
        strategyId: d.strategy_id,
        isSignalEnabled: d.is_signal_enabled,
        targetSymbols: d.target_symbols || [],
        targetTimeframes: d.target_timeframes || [],
        createdAt: d.created_at,
        updatedAt: d.updated_at
    }));
};

/**
 * Create or update signal configuration for a strategy
 */
export const upsertStrategySignalConfig = async (
    config: Omit<StrategySignalConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<StrategySignalConfig> => {
    const { data, error } = await supabase
        .from('strategy_signal_config')
        .upsert({
            strategy_id: config.strategyId,
            is_signal_enabled: config.isSignalEnabled,
            target_symbols: config.targetSymbols,
            target_timeframes: config.targetTimeframes,
            updated_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) throw new Error(error.message);

    return {
        id: data.id,
        strategyId: data.strategy_id,
        isSignalEnabled: data.is_signal_enabled,
        targetSymbols: data.target_symbols || [],
        targetTimeframes: data.target_timeframes || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at
    };
};

/**
 * Enable signal generation for a strategy
 */
export const enableStrategySignals = async (strategyId: string): Promise<void> => {
    const existing = await getStrategySignalConfig(strategyId);

    if (existing) {
        await upsertStrategySignalConfig({
            ...existing,
            isSignalEnabled: true
        });
    } else {
        // Create new config with default values
        await upsertStrategySignalConfig({
            strategyId,
            isSignalEnabled: true,
            targetSymbols: [], // Empty means all symbols
            targetTimeframes: [] // Empty means all timeframes
        });
    }
};

/**
 * Disable signal generation for a strategy
 */
export const disableStrategySignals = async (strategyId: string): Promise<void> => {
    const existing = await getStrategySignalConfig(strategyId);

    if (existing) {
        await upsertStrategySignalConfig({
            ...existing,
            isSignalEnabled: false
        });
    }
};

/**
 * Delete signal configuration for a strategy
 */
export const deleteStrategySignalConfig = async (strategyId: string): Promise<void> => {
    const { error } = await supabase
        .from('strategy_signal_config')
        .delete()
        .eq('strategy_id', strategyId);

    if (error) throw new Error(error.message);
};

// Signal Engine Status Management (client-side storage)
const ENGINE_STATUS_KEY = 'signal_engine_status';

/**
 * Get engine status from localStorage (for UI display)
 */
export const getStoredEngineStatus = (): { isEnabled: boolean } => {
    const stored = localStorage.getItem(ENGINE_STATUS_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return { isEnabled: true }; // Default to true on error
        }
    }
    return { isEnabled: true }; // Default to true if not set
};

/**
 * Save engine status to localStorage
 */
export const setStoredEngineStatus = (isEnabled: boolean): void => {
    localStorage.setItem(ENGINE_STATUS_KEY, JSON.stringify({ isEnabled }));
};
