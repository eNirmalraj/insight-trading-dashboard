-- Atomic RPC for Closing Position
CREATE OR REPLACE FUNCTION public.close_paper_trade(
    p_signal_id UUID,
    p_pnl_percent NUMERIC,
    p_close_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trade RECORD;
    v_account_id UUID;
    v_current_balance NUMERIC;
    v_cost NUMERIC;
    v_pnl_amount NUMERIC;
    v_exit_price NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- 1. Get Trade (Lock for Update)
    SELECT * INTO v_trade
    FROM public.paper_trades
    WHERE signal_id = p_signal_id
    FOR UPDATE;

    -- 2. Check Existence
    IF v_trade IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trade not found');
    END IF;

    -- 3. Idempotency: If already closed, return success
    IF v_trade.status = 'CLOSED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trade already closed');
    END IF;

    -- 4. Get Account (Lock)
    SELECT id, balance INTO v_account_id, v_current_balance
    FROM public.paper_trading_accounts
    WHERE user_id = v_trade.user_id
    FOR UPDATE;

    IF v_account_id IS NULL THEN
         RETURN jsonb_build_object('success', false, 'error', 'Account not found');
    END IF;

    -- 5. Calculate Metrics
    v_cost := v_trade.quantity * v_trade.entry_price;
    v_pnl_amount := v_cost * (p_pnl_percent / 100.0);

    IF v_trade.direction = 'BUY' THEN
        v_exit_price := v_trade.entry_price * (1 + p_pnl_percent / 100.0);
    ELSE
        v_exit_price := v_trade.entry_price * (1 - p_pnl_percent / 100.0);
    END IF;

    v_new_balance := v_current_balance + v_cost + v_pnl_amount;

    -- 6. Update Trade
    UPDATE public.paper_trades
    SET status = 'CLOSED',
        exit_price = v_exit_price,
        pnl = v_pnl_amount,
        pnl_percent = p_pnl_percent,
        exit_reason = p_close_reason,
        closed_at = NOW()
    WHERE id = v_trade.id;

    -- 7. Update Balance
    UPDATE public.paper_trading_accounts
    SET balance = v_new_balance
    WHERE id = v_account_id;

    RETURN jsonb_build_object(
        'success', true, 
        'trade_id', v_trade.id, 
        'pnl', v_pnl_amount, 
        'new_balance', v_new_balance
    );

EXCEPTION WHEN OTHERS THEN
    RAISE; -- Propagate errors
END;
$$;
