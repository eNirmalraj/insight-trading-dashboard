export interface SharedStrategy {
    id: string;
    user_id: string;
    strategy_name: string;
    description: string;
    performance_metrics: {
        winRate: number;
        profitFactor: number;
        totalTrades: number;
    };
    likes_count: number;
    clones_count: number;
    created_at: string;

    // Joined fields (handled by service)
    author_name?: string;
    author_avatar?: string;
    is_liked_by_me?: boolean;
}

export interface UserProfilePublic {
    id: string;
    full_name: string;
    avatar_url: string;
    bio?: string;
    followers_count: number;
    following_count: number;
    is_followed_by_me?: boolean;
}
