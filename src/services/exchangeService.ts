import { supabase } from './supabaseClient';
import { ExchangeKey, CreateExchangeKeyPayload } from '../types/exchange';

/**
 * Fetch all exchange keys for the current user
 */
export const getExchangeKeys = async (): Promise<ExchangeKey[]> => {
    const { data, error } = await supabase
        .from('user_exchange_keys')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as ExchangeKey[];
};

/**
 * Add a new exchange key
 */
export const addExchangeKey = async (payload: CreateExchangeKeyPayload): Promise<ExchangeKey> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
        .from('user_exchange_keys')
        .insert({
            user_id: user.id,
            exchange: payload.exchange,
            nickname: payload.nickname,
            api_key: payload.api_key,
            api_secret: payload.api_secret, // Stored as is (RLS protected)
            is_active: true
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data as ExchangeKey;
};

/**
 * Delete an exchange key
 */
export const deleteExchangeKey = async (id: string): Promise<void> => {
    const { error } = await supabase
        .from('user_exchange_keys')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
};

/**
 * Toggle active status
 */
export const toggleExchangeKeyStatus = async (id: string, isActive: boolean): Promise<void> => {
    const { error } = await supabase
        .from('user_exchange_keys')
        .update({ is_active: isActive })
        .eq('id', id);

    if (error) throw new Error(error.message);
};
