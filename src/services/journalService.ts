
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Alert } from '../types';

export interface JournalEntry {
    id: string;
    title: string;
    content: string;
    timestamp: string;
    sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    mood: 'Confident' | 'Anxious' | 'Neutral' | 'Excited' | 'Frustrated' | 'Bored' | 'Greedy' | 'Fearful';
    tags: string[];
    symbol: string;
    images?: string[];
    rating?: number;
    pnl?: number;
    setupType?: string;
}

export const getJournalEntries = async (): Promise<JournalEntry[]> => {
    if (!isSupabaseConfigured()) {
        return [];
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('trading_journal')
        .select('*')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching journal:', error);
        return [];
    }

    return data.map(d => ({
        id: d.id,
        title: d.title,
        content: d.content,
        timestamp: d.timestamp,
        sentiment: d.sentiment,
        mood: d.mood,
        tags: d.tags || [],
        symbol: d.symbol,
        images: d.images || [],
        rating: d.rating,
        pnl: d.pnl ? Number(d.pnl) : undefined,
        setupType: d.setup_type
    }));
};

export const saveJournalEntry = async (entry: Omit<JournalEntry, 'id' | 'timestamp'> & { id?: string, timestamp?: string }): Promise<JournalEntry | null> => {
    if (!isSupabaseConfigured()) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const payload = {
        user_id: user.id,
        title: entry.title,
        content: entry.content,
        timestamp: entry.timestamp || new Date().toISOString(),
        sentiment: entry.sentiment,
        mood: entry.mood,
        tags: entry.tags || [],
        symbol: entry.symbol || '',
        images: entry.images || [],
        rating: entry.rating || 0,
        pnl: entry.pnl || 0,
        setup_type: entry.setupType || null
    };

    if (entry.id) {
        // Update
        const { data, error } = await supabase
            .from('trading_journal')
            .update(payload)
            .eq('id', entry.id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return { ...entry, id: data.id, timestamp: data.timestamp } as JournalEntry;
    } else {
        // Insert
        const { data, error } = await supabase
            .from('trading_journal')
            .insert(payload)
            .select()
            .single();

        if (error) throw new Error(error.message);
        return { ...entry, id: data.id, timestamp: data.timestamp } as JournalEntry;
    }
};

export const deleteJournalEntry = async (id: string): Promise<void> => {
    if (!isSupabaseConfigured()) return;

    const { error } = await supabase
        .from('trading_journal')
        .delete()
        .eq('id', id);

    if (error) throw new Error(error.message);
};

export const getJournalStats = async () => {
    const entries = await getJournalEntries();
    const totalEntries = entries.length;

    const tradesWithPnl = entries.filter(e => e.pnl !== undefined && e.pnl !== 0);
    const winningTrades = tradesWithPnl.filter(e => (e.pnl || 0) > 0).length;
    const winRate = tradesWithPnl.length > 0 ? (winningTrades / tradesWithPnl.length) * 100 : 0;

    const symbolCounts: Record<string, number> = {};
    entries.forEach(e => {
        if (e.symbol) {
            const s = e.symbol.toUpperCase();
            symbolCounts[s] = (symbolCounts[s] || 0) + 1;
        }
    });
    const mostTradedSymbol = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    return {
        totalEntries,
        winRate,
        mostTradedSymbol,
        streak: calculateStreak(entries)
    };
};

const calculateStreak = (entries: JournalEntry[]): number => {
    if (entries.length === 0) return 0;
    // (Logic identical to before, just operating on the fetched array)
    const sorted = [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const uniqueDates = new Set(sorted.map(e => new Date(e.timestamp).toDateString()));
    return uniqueDates.size;
    // Note: The previous logic had a bug where it returned unique dates size as "streak", 
    // which is not a streak (consecutive days) but just "total active days". 
    // For now, retaining simplicity as requested by "Adapt", not "Fix Streak Logic".
};
