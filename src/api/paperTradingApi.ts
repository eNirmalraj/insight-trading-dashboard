import { supabase } from '../services/supabaseClient';

export interface PaperTradingAccount {
    id: string;
    user_id: string;
    name: string;
    broker: 'Crypto' | 'Forex' | 'Indian';
    sub_type: 'spot' | 'futures'; // Added for Binance alignment
    balance: number;
    currency: string;
    created_at: string;
    updated_at: string;
}

export type PaperTradingAccountInput = Omit<PaperTradingAccount, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

/**
 * Fetch all paper trading accounts for the authenticated user
 */
export async function getPaperTradingAccounts(): Promise<PaperTradingAccount[]> {
    console.log('[Paper Trading API] Fetching accounts...');
    const startTime = Date.now();

    try {
        // Use getSession instead of getUser - it's cached and much faster
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        console.log('[Paper Trading API] Auth check took:', Date.now() - startTime, 'ms');

        if (authError) {
            console.error('[Paper Trading API] Auth error:', authError);
            throw new Error('Authentication failed: ' + authError.message);
        }

        if (!session?.user) {
            console.warn('[Paper Trading API] No authenticated user');
            return []; // Return empty array instead of throwing error
        }

        console.log('[Paper Trading API] User authenticated:', session.user.id);

        // Query with RLS - will automatically filter by user_id
        const queryStart = Date.now();
        const { data, error } = await supabase
            .from('paper_trading_accounts')
            .select('*')
            .order('created_at', { ascending: false });

        console.log('[Paper Trading API] Query took:', Date.now() - queryStart, 'ms');
        console.log('[Paper Trading API] Total time:', Date.now() - startTime, 'ms');

        if (error) {
            console.error('[Paper Trading API] Query error:', error);
            throw error;
        }

        console.log('[Paper Trading API] Found', data?.length || 0, 'accounts');
        return data || [];
    } catch (err: any) {
        console.error('[Paper Trading API] Unexpected error:', err);
        throw err;
    }
}

/**
 * Create a new paper trading account
 */
export async function createPaperTradingAccount(
    account: PaperTradingAccountInput
): Promise<PaperTradingAccount> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
        .from('paper_trading_accounts')
        .insert({
            user_id: user.id,
            ...account,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating paper trading account:', error);
        throw error;
    }

    return data;
}

/**
 * Update an existing paper trading account
 */
export async function updatePaperTradingAccount(
    id: string,
    updates: Partial<PaperTradingAccountInput>
): Promise<PaperTradingAccount> {
    const { data, error } = await supabase
        .from('paper_trading_accounts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating paper trading account:', error);
        throw error;
    }

    return data;
}

/**
 * Delete a paper trading account
 */
export async function deletePaperTradingAccount(id: string): Promise<void> {
    const { error } = await supabase
        .from('paper_trading_accounts')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting paper trading account:', error);
        throw error;
    }
}

/**
 * Transfer funds between two paper trading accounts
 */
export async function transferFunds(
    fromAccountId: string,
    toAccountId: string,
    amount: number
): Promise<{ success: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Debit fromAccountId
    const { data: fromAccount, error: fetchFromError } = await supabase
        .from('paper_trading_accounts')
        .select('balance')
        .eq('id', fromAccountId)
        .single();

    if (fetchFromError || !fromAccount) throw new Error('Source account not found');
    if (fromAccount.balance < amount) throw new Error('Insufficient balance in source account');

    const { error: debitError } = await supabase
        .from('paper_trading_accounts')
        .update({ balance: fromAccount.balance - amount })
        .eq('id', fromAccountId);

    if (debitError) throw new Error('Failed to debit source account: ' + debitError.message);

    // 2. Credit toAccountId
    const { data: toAccount, error: fetchToError } = await supabase
        .from('paper_trading_accounts')
        .select('balance')
        .eq('id', toAccountId)
        .single();

    if (fetchToError || !toAccount) {
        // ROLLBACK
        await supabase
            .from('paper_trading_accounts')
            .update({ balance: fromAccount.balance })
            .eq('id', fromAccountId);
        throw new Error('Target account not found');
    }

    const { error: creditError } = await supabase
        .from('paper_trading_accounts')
        .update({ balance: toAccount.balance + amount })
        .eq('id', toAccountId);

    if (creditError) {
        // ROLLBACK
        await supabase
            .from('paper_trading_accounts')
            .update({ balance: fromAccount.balance })
            .eq('id', fromAccountId);
        throw new Error('Failed to credit target account: ' + creditError.message);
    }

    return { success: true };
}
