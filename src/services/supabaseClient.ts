// src/services/supabaseClient.ts
// Supabase client initialization

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create Supabase client (will be null-ish if no credentials provided)
export const supabase: SupabaseClient | null =
    supabaseUrl && supabaseAnonKey
        ? createClient(supabaseUrl, supabaseAnonKey)
        : null;

/**
 * Check if Supabase is properly configured
 */
export const isSupabaseConfigured = (): boolean => {
    return Boolean(supabaseUrl && supabaseAnonKey && supabase);
};

export default supabase;
