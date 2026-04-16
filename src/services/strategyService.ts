// src/services/strategyService.ts
import { db, isSupabaseConfigured } from './supabaseClient';
import { Strategy } from '../types';

export const getStrategies = async (): Promise<Strategy[]> => {
    if (!isSupabaseConfigured()) {
        return [];
    }

    const { data, error } = await db()
        .from('scripts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        // Gracefully degrade: log the error but return empty list so the UI
        // doesn't surface a scary banner when the scripts table is empty,
        // misconfigured, or transiently unreachable.
        console.warn('[strategyService] getStrategies failed:', error.message);
        return [];
    }

    return (data || []).map((d: any) => {
        // Read configuration from the jsonb column if available
        const config =
            d.configuration && typeof d.configuration === 'object' ? d.configuration : {};
        return {
            id: d.id,
            name: d.name || '',
            description: d.description || '',
            timeframe: config.timeframe || '1h',
            symbolScope: config.symbolScope || [],
            entryRules: config.entryRules || [],
            exitRules: config.exitRules || [],
            indicators: config.indicators || [],
            isActive: d.is_active ?? true,
            type: d.script_type || 'STRATEGY',
            scriptSource: d.source_code || '',
        };
    });
};

export const saveStrategy = async (
    strategy: Omit<Strategy, 'id'> & { id?: string }
): Promise<string> => {
    const {
        data: { user },
    } = await db().auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const row = {
        name: strategy.name,
        description: strategy.description || '',
        script_type: strategy.type || 'STRATEGY',
        is_active: strategy.isActive ?? true,
        source_code: strategy.scriptSource || '',
        configuration: {
            timeframe: strategy.timeframe,
            symbolScope: strategy.symbolScope,
            entryRules: strategy.entryRules,
            exitRules: strategy.exitRules,
            indicators: strategy.indicators,
        },
    };

    if (strategy.id && !strategy.id.startsWith('new-') && !strategy.id.startsWith('builtin-')) {
        // UPDATE existing script
        const { error } = await db()
            .from('scripts')
            .update(row)
            .eq('id', strategy.id)
            .eq('user_id', user.id);

        if (error) throw new Error(error.message);
        return strategy.id;
    } else {
        // INSERT new script
        const { data, error } = await db()
            .from('scripts')
            .insert({ ...row, user_id: user.id })
            .select('id')
            .single();

        if (error) throw new Error(error.message);
        return data.id;
    }
};

export const deleteStrategy = async (id: string): Promise<void> => {
    const {
        data: { user },
    } = await db().auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { error } = await db().from('scripts').delete().eq('id', id).eq('user_id', user.id);

    if (error) throw new Error(error.message);
};

export const validateStrategyJson = (json: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (!json.name) errors.push('Missing "name"');
    if (!json.timeframe) errors.push('Missing "timeframe"');
    if (!json.indicators || !Array.isArray(json.indicators))
        errors.push('Missing or invalid "indicators" array');
    if (json.type === 'STRATEGY') {
        if (!json.entry_rules || !Array.isArray(json.entry_rules))
            errors.push('Missing or invalid "entry_rules" array');
        if (!json.exit_rules || !Array.isArray(json.exit_rules))
            errors.push('Missing or invalid "exit_rules" array');
    }

    return { valid: errors.length === 0, errors };
};
