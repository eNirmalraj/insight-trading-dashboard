import { supabaseAdmin } from '../services/supabaseAdmin';

export type UserTier = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface UserQuota {
    user_id: string;
    tier: UserTier;
    max_scripts: number;
    max_backtests: number;
    max_execution_time_ms: number;
    allowed_symbols: string[];
    can_publish_scripts: boolean;
}

export interface QuotaUsage {
    scripts_used: number;
    backtests_used: number;
    execution_time_used_ms: number;
}

/**
 * UserQuotaManager
 * Manages tier-based resource limits for users
 */
export class UserQuotaManager {
    private readonly TIER_LIMITS: Record<UserTier, Omit<UserQuota, 'user_id'>> = {
        FREE: {
            tier: 'FREE',
            max_scripts: 5,
            max_backtests: 10,
            max_execution_time_ms: 60000, // 1 minute/month
            allowed_symbols: ['BTC/USDT', 'ETH/USDT'],
            can_publish_scripts: false,
        },
        PRO: {
            tier: 'PRO',
            max_scripts: 50,
            max_backtests: 100,
            max_execution_time_ms: 600000, // 10 minutes/month
            allowed_symbols: [], // All symbols
            can_publish_scripts: true,
        },
        ENTERPRISE: {
            tier: 'ENTERPRISE',
            max_scripts: -1, // Unlimited
            max_backtests: -1, // Unlimited
            max_execution_time_ms: -1, // Unlimited
            allowed_symbols: [], // All symbols
            can_publish_scripts: true,
        },
    };

    /**
     * Get quota for a user
     */
    async getUserQuota(userId: string): Promise<UserQuota> {
        const { data, error } = await supabaseAdmin
            .from('user_quotas')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error || !data) {
            // Create default FREE quota if not exists
            return this.createUserQuota(userId, 'FREE');
        }

        return data as UserQuota;
    }

    /**
     * Create quota for a user
     */
    async createUserQuota(userId: string, tier: UserTier): Promise<UserQuota> {
        const quota = {
            user_id: userId,
            ...this.TIER_LIMITS[tier],
        };

        const { data, error } = await supabaseAdmin
            .from('user_quotas')
            .insert(quota)
            .select()
            .single();

        if (error) throw new Error(`Failed to create quota: ${error.message}`);
        return data as UserQuota;
    }

    /**
     * Update user tier
     */
    async updateUserTier(userId: string, tier: UserTier): Promise<UserQuota> {
        const newQuota = this.TIER_LIMITS[tier];

        const { data, error } = await supabaseAdmin
            .from('user_quotas')
            .update(newQuota)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw new Error(`Failed to update tier: ${error.message}`);
        return data as UserQuota;
    }

    /**
     * Check if user can perform an action
     */
    async canPerformAction(
        userId: string,
        action: 'create_script' | 'run_backtest' | 'publish_script',
        usage?: QuotaUsage
    ): Promise<{ allowed: boolean; reason?: string }> {
        const quota = await this.getUserQuota(userId);

        switch (action) {
            case 'create_script':
                if (quota.max_scripts === -1) return { allowed: true };
                const scriptCount = usage?.scripts_used || (await this.getScriptCount(userId));
                if (scriptCount >= quota.max_scripts) {
                    return {
                        allowed: false,
                        reason: `Script limit reached (${quota.max_scripts}). Upgrade to ${quota.tier === 'FREE' ? 'PRO' : 'ENTERPRISE'}.`,
                    };
                }
                break;

            case 'run_backtest':
                if (quota.max_backtests === -1) return { allowed: true };
                const backtestCount =
                    usage?.backtests_used || (await this.getBacktestCount(userId));
                if (backtestCount >= quota.max_backtests) {
                    return {
                        allowed: false,
                        reason: `Backtest limit reached (${quota.max_backtests}). Upgrade to ${quota.tier === 'FREE' ? 'PRO' : 'ENTERPRISE'}.`,
                    };
                }
                break;

            case 'publish_script':
                if (!quota.can_publish_scripts) {
                    return {
                        allowed: false,
                        reason: 'Publishing scripts requires PRO or ENTERPRISE tier.',
                    };
                }
                break;
        }

        return { allowed: true };
    }

    /**
     * Check if symbol is allowed for user
     */
    async isSymbolAllowed(userId: string, symbol: string): Promise<boolean> {
        const quota = await this.getUserQuota(userId);

        // Empty array means all symbols allowed
        if (quota.allowed_symbols.length === 0) return true;

        return quota.allowed_symbols.includes(symbol);
    }

    /**
     * Get current usage for a user
     */
    async getUsage(userId: string): Promise<QuotaUsage> {
        const scripts_used = await this.getScriptCount(userId);
        const backtests_used = await this.getBacktestCount(userId);

        return {
            scripts_used,
            backtests_used,
            execution_time_used_ms: 0, // TODO: Track execution time
        };
    }

    /**
     * Get script count for user
     */
    private async getScriptCount(userId: string): Promise<number> {
        const { count, error } = await supabaseAdmin
            .from('scripts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) return 0;
        return count || 0;
    }

    /**
     * Get backtest count for user (monthly)
     */
    private async getBacktestCount(userId: string): Promise<number> {
        // TODO: Implement backtest tracking table
        return 0;
    }
}

export const userQuotaManager = new UserQuotaManager();
