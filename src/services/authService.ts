// src/services/authService.ts
// Authentication service with Supabase integration only

import { supabase } from './supabaseClient';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

// --- Auth Service Functions ---

export interface AuthResult {
    success: boolean;
    error?: string;
    user?: User;
}

/**
 * Sign in with email and password
 */
export const signIn = async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, user: data.user || undefined };
};

/**
 * Sign up with email and password
 */
export const signUp = async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, user: data.user || undefined };
};

/**
 * Sign out current user
 */
export const signOut = async (): Promise<void> => {
    if (supabase) {
        await supabase.auth.signOut();
    }
};

/**
 * Get current session
 */
export const getSession = async (): Promise<Session | null> => {
    if (!supabase) {
        return null;
    }

    const { data } = await supabase.auth.getSession();
    return data.session;
};

/**
 * Get current user
 */
export const getUser = async (): Promise<User | null> => {
    const session = await getSession();
    return session?.user ?? null;
};

/**
 * Subscribe to auth state changes
 */
export const onAuthStateChange = (
    callback: (event: string, session: Session | null) => void
): (() => void) => {
    if (!supabase) {
        return () => { };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, session: Session | null) => {
            callback(event, session);
        }
    );

    return () => {
        subscription.unsubscribe();
    };
};

/**
 * Get user settings from profiles table
 */
export const getUserSettings = async (): Promise<any> => {
    if (!supabase) return {};

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};

    const { data, error } = await supabase
        .from('profiles')
        .select('settings')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Error fetching user settings:', error);
        return {};
    }

    return data?.settings || {};
};

/**
 * Update user settings in profiles table
 * Merges with existing settings
 */
export const updateUserSettings = async (newSettings: any): Promise<boolean> => {
    if (!supabase) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // First get existing settings to merge (though Postgres jsonb_set or || would be better, simple merge here works for now)
    // Actually, let's just do a smart update if possible? 
    // Supabase update with jsonb will replace the top-level keys. 
    // To do a deep merge is harder in one shot. 
    // Let's assume the caller passes the slice they want to update, and we might need to fetch-merge-save 
    // or use a Postgres function. 
    // For simplicity and to avoid race conditions on *different* keys, we can use the `||` operator in SQL if we had an RPC, 
    // but standard update replaces the value.
    // Let's fetch current first to be safe, or just rely on the frontend passing what it knows + optimistic.
    // Actually, for just tool position, a simple fetch-merge-update is fine for low frequency.

    const currentSettings = await getUserSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };

    const { error } = await supabase
        .from('profiles')
        .update({ settings: updatedSettings })
        .eq('id', user.id);

    if (error) {
        console.error('Error updating user settings:', error);
        return false;
    }

    return true;
};

export default {
    signIn,
    signUp,
    signOut,
    getSession,
    getUser,
    onAuthStateChange,
    getUserSettings,
    updateUserSettings,
};
