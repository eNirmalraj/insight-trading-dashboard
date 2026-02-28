import { supabaseAdmin } from './supabaseAdmin';

export interface AuditTradeEntry {
    timestamp: Date;
    user_id: string;
    script_id: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    price: number;
    pnl?: number;
    regulatory_flags?: Record<string, any>;
    risk_score?: number;
}

/**
 * AuditLogger
 * Logs all trades for compliance and regulatory purposes
 */
export class AuditLogger {
    async logTrade(trade: AuditTradeEntry): Promise<void> {
        try {
            const { error } = await supabaseAdmin
                .from('audit_trades')
                .insert({
                    timestamp: trade.timestamp,
                    user_id: trade.user_id,
                    script_id: trade.script_id,
                    symbol: trade.symbol,
                    side: trade.side,
                    quantity: trade.quantity,
                    price: trade.price,
                    pnl: trade.pnl || 0,
                    regulatory_flags: trade.regulatory_flags || {},
                    risk_score: trade.risk_score || 0
                });

            if (error) {
                console.error('Failed to log trade:', error);
            }
        } catch (err) {
            console.error('Audit logging error:', err);
        }
    }

    /**
     * Check compliance flags for a trade
     */
    private checkCompliance(trade: AuditTradeEntry): Record<string, any> {
        const flags: Record<string, any> = {};

        // Example: Flag large trades
        if (trade.quantity * trade.price > 100000) {
            flags.large_trade = true;
        }

        // Example: Flag rapid trading
        // This would require checking recent trade history

        return flags;
    }

    /**
     * Calculate risk score (0-100)
     */
    private calculateRiskScore(trade: AuditTradeEntry): number {
        let score = 0;

        // Higher risk for larger trades
        const tradeValue = trade.quantity * trade.price;
        if (tradeValue > 50000) score += 30;
        else if (tradeValue > 10000) score += 15;

        // Higher risk for leverage
        // (would need position data)

        return Math.min(score, 100);
    }
}

export const auditLogger = new AuditLogger();
