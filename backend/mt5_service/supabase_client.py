# backend/mt5_service/supabase_client.py
# Supabase Database Client for Signal Storage

from supabase import create_client, Client
from datetime import datetime, timedelta
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DUPLICATE_LOOKBACK_MINUTES


# Initialize Supabase client
supabase: Client = None

def init_supabase():
    """Initialize Supabase connection"""
    global supabase
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("[Supabase] ❌ Missing URL or Service Key in config")
        return False
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print(f"[Supabase] ✅ Connected to {SUPABASE_URL[:30]}...")
        return True
    except Exception as e:
        print(f"[Supabase] ❌ Connection failed: {e}")
        return False


def is_duplicate_signal(strategy_id: str, symbol: str, direction: str) -> bool:
    """Check if a duplicate signal exists within lookback period"""
    if supabase is None:
        return False
    
    try:
        lookback_time = (datetime.utcnow() - timedelta(minutes=DUPLICATE_LOOKBACK_MINUTES)).isoformat()
        
        result = supabase.table('signals') \
            .select('id') \
            .eq('strategy_id', strategy_id) \
            .eq('symbol', symbol) \
            .eq('direction', direction) \
            .gte('created_at', lookback_time) \
            .limit(1) \
            .execute()
        
        return len(result.data) > 0
    except Exception as e:
        print(f"[Supabase] Error checking duplicate: {e}")
        return False


def save_signal(
    symbol: str,
    strategy: str,
    strategy_id: str,
    strategy_category: str,
    direction: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    timeframe: str
) -> bool:
    """Save a new signal to the database"""
    if supabase is None:
        print("[Supabase] Not connected, cannot save signal")
        return False
    
    # Check for duplicate first
    if is_duplicate_signal(strategy_id, symbol, direction):
        print(f"[Supabase] Duplicate signal prevented for {symbol} {strategy}")
        return False
    
    try:
        result = supabase.table('signals').insert({
            'symbol': symbol,
            'strategy': strategy,
            'strategy_id': strategy_id,
            'strategy_category': strategy_category,
            'direction': direction,
            'entry_price': entry_price,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'timeframe': timeframe,
            'status': 'Pending',
            'entry_type': 'MARKET'
        }).execute()
        
        if result.data:
            print(f"[Supabase] ✅ Signal saved: {symbol} {direction} {strategy}")
            return True
        return False
    except Exception as e:
        print(f"[Supabase] Error saving signal: {e}")
        return False
