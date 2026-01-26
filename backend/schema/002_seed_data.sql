-- =============================================================================
-- SEED DATA FOR DEVELOPMENT/TESTING
-- =============================================================================
-- This file contains sample data for testing the schema.
-- DO NOT run this in production!
-- =============================================================================

-- Note: In development with mock mode, you won't need this data.
-- This is only for testing the Supabase schema directly.

-- Sample signals (these would typically be inserted by the system/admin)
-- You would need to run this with service_role key

/*
INSERT INTO public.signals (symbol, strategy, strategy_category, direction, entry_price, stop_loss, take_profit, timeframe, status)
VALUES 
    ('EURUSD', 'Smart Money Buy', 'Trend Following', 'BUY', 1.0850, 1.0800, 1.0950, '4H', 'Active'),
    ('GBPUSD', 'Order Block Short', 'Mean Reversion', 'SELL', 1.2650, 1.2700, 1.2550, '1H', 'Active'),
    ('BTCUSD', 'Breakout Long', 'Volatility Breakout', 'BUY', 68000, 65000, 75000, '1D', 'Pending'),
    ('USDJPY', 'FVG Rejection', 'Mean Reversion', 'SELL', 155.00, 156.00, 153.00, '4H', 'Closed');
*/

-- For testing user-specific data, you need to:
-- 1. Create a user through Supabase Auth
-- 2. The trigger will auto-create their profile
-- 3. Then you can insert watchlists, positions, etc. for that user
