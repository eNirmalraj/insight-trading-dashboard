// src/services/strategyService.ts
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Strategy, StrategyParameter } from '../types';

export const getStrategies = async (): Promise<Strategy[]> => {
    if (!isSupabaseConfigured()) {
        return [];
    }

    const { data, error } = await supabase
        .from('strategies')
        .select(`
            *,
            strategy_parameters (*)
        `)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return data.map((d: any) => {
        if (d.content) {
            // If content column exists, use it as the source of truth for the script structure
            // but ensure DB-managed fields (ID) are preserved.
            return {
                ...d.content,
                id: d.id,
                isActive: d.is_active,
                // Ensure type matches DB column if needed, or trust content
                type: d.type || d.content.type || 'STRATEGY'
            };
        }
        // Fallback for old records
        return {
            id: d.id,
            name: d.name,
            description: d.description,
            timeframe: d.timeframe,
            symbolScope: d.symbol_scope,
            entryRules: d.entry_rules,
            exitRules: d.exit_rules,
            indicators: d.indicators,
            isActive: d.is_active,
            parameters: d.strategy_parameters,
            type: d.type || 'STRATEGY',
            tradingMode: d.trading_mode || 'paper' // Added field
        };
    });
};

export const saveStrategy = async (strategy: Omit<Strategy, 'id'> & { id?: string }): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    if (strategy.id && !strategy.id.startsWith('new-') && !strategy.id.startsWith('builtin-')) {
        // UPDATE existing strategy
        const { error: sError } = await supabase
            .from('strategies')
            .update({
                name: strategy.name,
                description: strategy.description,
                timeframe: strategy.timeframe,
                symbol_scope: strategy.symbolScope,
                entry_rules: strategy.entryRules,
                exit_rules: strategy.exitRules,
                indicators: strategy.indicators,
                is_active: strategy.isActive,
                type: strategy.type,
                content: strategy // Save full JSON content
            })
            .eq('id', strategy.id)
            .eq('user_id', user.id); // Security check

        if (sError) throw new Error(sError.message);
    } else {
        // INSERT new strategy
        const { data: sData, error: sError } = await supabase
            .from('strategies')
            .insert({
                user_id: user.id,
                name: strategy.name,
                description: strategy.description,
                timeframe: strategy.timeframe,
                symbol_scope: strategy.symbolScope,
                entry_rules: strategy.entryRules,
                exit_rules: strategy.exitRules,
                indicators: strategy.indicators,
                is_active: strategy.isActive,
                type: strategy.type,
                content: strategy // Save full JSON content
            })
            .select()
            .single();

        if (sError) throw new Error(sError.message);

        // For new strategies, we'd normally handle params here, but basic logic above suffices for now.
        // We might want to clear old params on update if we supported them fully.

        if (strategy.parameters && strategy.parameters.length > 0) {
            const params = strategy.parameters.map(p => ({
                strategy_id: sData.id,
                name: p.name,
                value: p.value,
                type: p.type
            }));

            const { error: pError } = await supabase
                .from('strategy_parameters')
                .insert(params);

            if (pError) throw new Error(pError.message);
        }
    }
};

export const deleteStrategy = async (id: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await supabase
        .from('strategies')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw new Error(error.message);
};

export const validateStrategyJson = (json: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (!json.name) errors.push('Missing "name"');
    if (!json.timeframe) errors.push('Missing "timeframe"');
    if (!json.indicators || !Array.isArray(json.indicators)) errors.push('Missing or invalid "indicators" array');
    // Rules optional for Indicators?
    if (json.type === 'STRATEGY') {
        if (!json.entry_rules || !Array.isArray(json.entry_rules)) errors.push('Missing or invalid "entry_rules" array');
        if (!json.exit_rules || !Array.isArray(json.exit_rules)) errors.push('Missing or invalid "exit_rules" array');
    }

    return { valid: errors.length === 0, errors };
};
