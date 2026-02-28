import { supabaseAdmin } from './supabaseAdmin';

export interface LeaderboardEntry {
    script_id: string;
    script_name: string;
    author_id: string;
    sharpe_ratio: number;
    total_return: number;
    max_drawdown: number;
    total_trades: number;
    rank: number;
}

export class LeaderboardService {
    /**
     * Get top performing strategies by Sharpe Ratio from real backtest results
     */
    async getTopStrategiesBySharpe(limit: number = 20): Promise<LeaderboardEntry[]> {
        // Query backtest_results joined with scripts
        const { data, error } = await supabaseAdmin
            .from('backtest_results')
            .select(`
                script_id,
                sharpe_ratio,
                total_return_percent,
                max_drawdown,
                total_trades,
                scripts:script_id (name, user_id)
            `)
            .order('sharpe_ratio', { ascending: false })
            .limit(limit);

        if (error) throw new Error(`Failed to fetch leaderboard: ${error.message}`);

        return (data || []).map((entry: any, index: number) => ({
            script_id: entry.script_id,
            script_name: entry.scripts?.name || 'Unknown Script',
            author_id: entry.scripts?.user_id,
            sharpe_ratio: entry.sharpe_ratio || 0,
            total_return: entry.total_return_percent || 0,
            max_drawdown: entry.max_drawdown || 0,
            total_trades: entry.total_trades || 0,
            rank: index + 1
        }));
    }

    /**
     * Get most popular scripts by likes
     */
    async getMostPopularScripts(limit: number = 20): Promise<any[]> {
        // Since we can't easily order by relation count in simple Supabase query,
        // we might query script_likes grouping or rely on a materialized view or scheduled function.
        // For accurate real-time MVP, we fetch listings and their like counts.

        // Alternative: Query marketplace_listings which are public, then sort.
        const { data, error } = await supabaseAdmin
            .from('marketplace_listings')
            .select(`
                id,
                title,
                author_id,
                likes:script_likes(count),
                downloads,
                forks
            `)
            .eq('is_public', true)
            .limit(100); // Fetch more to sort in memory for MVP

        if (error) throw new Error(`Failed to get popular scripts: ${error.message}`);

        // Sort by likes + downloads weight
        const sorted = (data || []).sort((a: any, b: any) => {
            const scoreA = (a.likes?.[0]?.count || 0) * 2 + (a.downloads || 0);
            const scoreB = (b.likes?.[0]?.count || 0) * 2 + (b.downloads || 0);
            return scoreB - scoreA;
        });

        return sorted.slice(0, limit);
    }

    /**
     * Get top contributors by number of published scripts
     */
    async getTopContributors(limit: number = 20): Promise<any[]> {
        // Use RPC or raw SQL for aggregation if possible, but for now
        // we can aggregate marketplace_listings.

        const { data, error } = await supabaseAdmin
            .from('marketplace_listings')
            .select('author_id')
            .eq('is_public', true);

        if (error) throw new Error(`Failed to get contributors: ${error.message}`);

        // Count scripts per author
        const contributorCounts = new Map<string, number>();
        data?.forEach((listing: any) => {
            const count = contributorCounts.get(listing.author_id) || 0;
            contributorCounts.set(listing.author_id, count + 1);
        });

        // Convert to sorted array
        const contributors = Array.from(contributorCounts.entries())
            .map(([author_id, script_count]) => ({ author_id, script_count }))
            .sort((a, b) => b.script_count - a.script_count)
            .slice(0, limit);

        return contributors;
    }
}

export const leaderboardService = new LeaderboardService();
