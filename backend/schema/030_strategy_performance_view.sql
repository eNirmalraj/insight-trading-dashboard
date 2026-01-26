-- Create a view to aggregate strategy performance metrics
CREATE OR REPLACE VIEW public.strategy_performance AS
SELECT 
    strategy_id,
    
    -- Total Closed Trades
    COUNT(*) AS total_trades,
    
    -- Win/Loss Counts (TP = Win, SL = Loss)
    COUNT(*) FILTER (WHERE close_reason = 'TP') AS win_count,
    COUNT(*) FILTER (WHERE close_reason = 'SL') AS loss_count,
    
    -- Win/Loss Rates
    CASE 
        WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE close_reason = 'TP')::NUMERIC / COUNT(*)) * 100, 2)
        ELSE 0 
    END AS win_rate,
    
    CASE 
        WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE close_reason = 'SL')::NUMERIC / COUNT(*)) * 100, 2)
        ELSE 0 
    END AS loss_rate,
    
    -- Average Risk/Reward Ratio
    -- RR = (Take Profit Distance) / (Stop Loss Distance)
    -- We use ABS to handle both BUY and SELL directions uniformly
    -- Handle division by zero safely
    ROUND(AVG(
        CASE 
            WHEN ABS(entry_price - stop_loss) > 0 THEN 
                ABS(take_profit - entry_price) / ABS(entry_price - stop_loss)
            ELSE 0 
        END
    )::NUMERIC, 2) AS avg_risk_reward_ratio,
    
    -- Average Trade Duration (in minutes)
    ROUND(AVG(
        EXTRACT(EPOCH FROM (closed_at - activated_at)) / 60
    )::NUMERIC, 0) AS avg_duration_minutes,
    
    -- Last Trade Timestamp
    MAX(closed_at) AS last_trade_at

FROM 
    public.signals
WHERE 
    status = 'Closed' 
    AND strategy_id IS NOT NULL
GROUP BY 
    strategy_id;

-- Grant access to authenticated users (so frontend can query it)
GRANT SELECT ON public.strategy_performance TO authenticated;
GRANT SELECT ON public.strategy_performance TO service_role;

-- Comment on view
COMMENT ON VIEW public.strategy_performance IS 'Aggregated performance metrics for each strategy based on CLOSED signals.';
