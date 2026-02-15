-- 1. Add UNIQUE constraint to prevent duplicate trades for the same signal
ALTER TABLE public.paper_trades
ADD CONSTRAINT paper_trades_signal_id_key UNIQUE (signal_id);

-- 2. Ensure Foreign Key exists (It was already in 031 but good to ensure/comment)
-- The original table definition already had REFERENCES public.signals(id), so we skip adding it again
-- just to be safe, we can try to add it only if it doesn't exist, but standard SQL doesn't support IF NOT EXISTS for constraints easily in one line without DO block.
-- Assuming 031 was run, it's there. The UNIQUE constraint is the critical addition.

-- 3. Create Atomic RPC for Opening Position
CREATE OR REPLACE FUNCTION public.open_paper_trade(
    p_user_id UUID,
    p_signal_id UUID,
    p_strategy_id UUID,
    p_symbol TEXT,
    p_direction TEXT,
    p_entry_price NUMERIC,
    p_initial_balance NUMERIC DEFAULT 10000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_account_id UUID;
    v_balance NUMERIC;
    v_trade_amount NUMERIC := 1000; -- Fixed trade amount for now
    v_quantity NUMERIC;
    v_new_trade_id UUID;
BEGIN
    -- 1. Get or Create Paper Account (Idempotent-ish)
    SELECT id, balance INTO v_account_id, v_balance
    FROM public.paper_trading_accounts
    WHERE user_id = p_user_id
    FOR UPDATE; -- Lock the account row

    IF v_account_id IS NULL THEN
        INSERT INTO public.paper_trading_accounts (user_id, name, broker, balance)
        VALUES (p_user_id, 'Default Paper Account', 'Crypto', p_initial_balance)
        RETURNING id, balance INTO v_account_id, v_balance;
    END IF;

    -- 2. Check Balance
    IF v_balance < v_trade_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 3. Check if Trade Already Exists (Idempotency)
    IF EXISTS (SELECT 1 FROM public.paper_trades WHERE signal_id = p_signal_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trade already exists');
    END IF;

    -- 4. Calculate Quantity
    v_quantity := v_trade_amount / p_entry_price;

    -- 5. Insert Trade
    INSERT INTO public.paper_trades (
        user_id, signal_id, strategy_id, symbol, direction, entry_price, quantity, status
    )
    VALUES (
        p_user_id, p_signal_id, p_strategy_id, p_symbol, p_direction, p_entry_price, v_quantity, 'OPEN'
    )
    RETURNING id INTO v_new_trade_id;

    -- 6. Update Balance (Deduct Cost)
    UPDATE public.paper_trading_accounts
    SET balance = balance - v_trade_amount
    WHERE id = v_account_id;

    RETURN jsonb_build_object('success', true, 'trade_id', v_new_trade_id, 'new_balance', v_balance - v_trade_amount);

EXCEPTION WHEN unique_violation THEN
    -- Handle race condition where trade was inserted concurrently
    RETURN jsonb_build_object('success', false, 'error', 'Trade already exists');
WHEN OTHERS THEN
    RAISE; -- Propagate other errors
END;
$$;
