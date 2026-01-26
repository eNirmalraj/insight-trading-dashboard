import { supabase } from './supabaseClient';
import { SharedStrategy, UserProfilePublic } from '../types/social';

// --- Shared Strategies (Feed) ---

export const getSharedStrategies = async (): Promise<SharedStrategy[]> => {
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Get strategies
    const { data: strategies, error } = await supabase
        .from('shared_strategies')
        .select(`
            *,
            profiles:user_id (full_name, avatar_url)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // 2. Enhance with "is_liked_by_me" if user is logged in
    // Note: For a real app, use a proper join or separate query. For MVP, we'll map.
    let likedIds = new Set<string>();
    if (user) {
        const { data: likes } = await supabase
            .from('social_likes')
            .select('target_id')
            .eq('user_id', user.id)
            .eq('target_type', 'strategy');

        if (likes) {
            likes.forEach((l: any) => likedIds.add(l.target_id));
        }
    }

    return strategies.map((s: any) => ({
        ...s,
        author_name: s.profiles?.full_name || 'Anonymous',
        author_avatar: s.profiles?.avatar_url,
        is_liked_by_me: likedIds.has(s.id)
    }));
};

export const likeStrategy = async (strategyId: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Must be logged in');

    // Optimistic UI updates should handle the count, but we need to track it in DB
    // Transaction ideally. Here: Simple insert + RPC increment (or manual Update)

    // 1. Insert Like
    const { error } = await supabase
        .from('social_likes')
        .insert({ user_id: user.id, target_id: strategyId, target_type: 'strategy' });

    if (error && error.code === '23505') return; // Already liked (unique constraint)
    if (error) throw new Error(error.message);

    // 2. Increment Counter
    await supabase.rpc('increment_likes', { row_id: strategyId }); // We need to define this RPC or just use raw update
};


// --- User Profiles ---

export const getUserProfile = async (userId: string): Promise<UserProfilePublic> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) throw new Error(error.message);

    // Mock counts for now (needs DB aggregation or counters)
    return {
        id: data.id,
        full_name: data.full_name,
        avatar_url: data.avatar_url,
        followers_count: 0,
        following_count: 0,
        bio: data.bio || ""
    };
};
