# backend/mt5_service/main.py
# MT5 Signal Engine - Main Entry Point

import MetaTrader5 as mt5
import time
from datetime import datetime
from typing import Dict, List
from config import MT5_LOGIN, MT5_PASSWORD, MT5_SERVER, TIMEFRAMES, BUFFER_SIZE
from strategy_engine import run_all_strategies, calculate_risk_levels, TradeDirection
from supabase_client import init_supabase, save_signal


# Candle buffer for each symbol/timeframe
candle_buffers: Dict[str, List[float]] = {}

# MT5 Timeframe mapping
MT5_TIMEFRAMES = {
    'H1': mt5.TIMEFRAME_H1,
    'H4': mt5.TIMEFRAME_H4,
    'D1': mt5.TIMEFRAME_D1,
}


def connect_mt5() -> bool:
    """Initialize MT5 connection"""
    print("[MT5] Initializing MetaTrader 5...")
    
    if not mt5.initialize():
        print(f"[MT5] ❌ Failed to initialize: {mt5.last_error()}")
        return False
    
    print(f"[MT5] ✅ MT5 Version: {mt5.version()}")
    
    # Login if credentials provided
    if MT5_LOGIN and MT5_PASSWORD and MT5_SERVER:
        authorized = mt5.login(MT5_LOGIN, password=MT5_PASSWORD, server=MT5_SERVER)
        if not authorized:
            print(f"[MT5] ❌ Login failed: {mt5.last_error()}")
            return False
        print(f"[MT5] ✅ Logged in as {MT5_LOGIN}")
    else:
        print("[MT5] ⚠️ No login credentials - using existing terminal session")
    
    return True


def get_forex_symbols() -> List[str]:
    """Get available Forex symbols from MT5"""
    symbols = mt5.symbols_get()
    if symbols is None:
        return []
    
    # Filter for forex pairs (common quote currencies)
    forex_quotes = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']
    forex_symbols = []
    
    for symbol in symbols:
        name = symbol.name.upper()
        # Check if it's a forex pair
        if len(name) == 6 and any(name.endswith(q) for q in forex_quotes):
            if symbol.visible and symbol.trade_mode != 0:
                forex_symbols.append(symbol.name)
    
    return forex_symbols[:50]  # Limit to top 50 for performance


def fetch_candles(symbol: str, timeframe: str, count: int = BUFFER_SIZE) -> List[float]:
    """Fetch historical candles from MT5"""
    mt5_tf = MT5_TIMEFRAMES.get(timeframe, mt5.TIMEFRAME_H1)
    
    rates = mt5.copy_rates_from_pos(symbol, mt5_tf, 0, count)
    if rates is None or len(rates) == 0:
        return []
    
    # Extract close prices
    closes = [rate['close'] for rate in rates]
    return closes


def process_symbol(symbol: str, timeframe: str):
    """Process a single symbol for signals"""
    buffer_key = f"{symbol}_{timeframe}"
    
    # Fetch latest candles
    closes = fetch_candles(symbol, timeframe, BUFFER_SIZE)
    if len(closes) < 50:
        return
    
    candle_buffers[buffer_key] = closes
    
    # Run strategies
    signals = run_all_strategies(closes)
    
    # Process each signal
    for signal in signals:
        if not signal.triggered or signal.direction is None:
            continue
        
        entry_price = closes[-1]
        levels = calculate_risk_levels(entry_price, signal.direction)
        
        # Save to database
        save_signal(
            symbol=symbol,
            strategy=signal.strategy_name,
            strategy_id=signal.strategy_id,
            strategy_category='Trend Following',
            direction=signal.direction.value,
            entry_price=entry_price,
            stop_loss=levels['stop_loss'],
            take_profit=levels['take_profit'],
            timeframe=timeframe
        )


def run_scan_cycle(symbols: List[str]):
    """Run one complete scan cycle across all symbols"""
    print(f"\n[MT5] Starting scan cycle at {datetime.now().strftime('%H:%M:%S')}")
    
    for symbol in symbols:
        for timeframe in TIMEFRAMES:
            try:
                process_symbol(symbol, timeframe)
            except Exception as e:
                print(f"[MT5] Error processing {symbol} {timeframe}: {e}")
            
            # Small delay to avoid overloading
            time.sleep(0.1)
    
    print(f"[MT5] Scan cycle complete. Processed {len(symbols)} symbols.")


def main():
    """Main entry point"""
    print("=" * 50)
    print("   MT5 SIGNAL ENGINE - FOREX & STOCKS")
    print("=" * 50)
    print()
    
    # Initialize Supabase
    if not init_supabase():
        print("[Engine] ❌ Failed to connect to Supabase. Exiting.")
        return
    
    # Connect to MT5
    if not connect_mt5():
        print("[Engine] ❌ Failed to connect to MT5. Exiting.")
        return
    
    # Get forex symbols
    symbols = get_forex_symbols()
    if not symbols:
        print("[Engine] ❌ No forex symbols found. Exiting.")
        mt5.shutdown()
        return
    
    print(f"\n[Engine] 📊 Monitoring {len(symbols)} forex symbols")
    print(f"[Engine] ⏱️ Timeframes: {', '.join(TIMEFRAMES)}")
    print(f"[Engine] 🔄 Scanning every 5 minutes...")
    print()
    
    try:
        while True:
            run_scan_cycle(symbols)
            
            # Wait 5 minutes before next scan
            # For more responsive signals, we check if new candles have closed
            print("[Engine] 💤 Waiting 5 minutes for next scan...")
            time.sleep(300)  # 5 minutes
            
    except KeyboardInterrupt:
        print("\n[Engine] Shutting down...")
    finally:
        mt5.shutdown()
        print("[Engine] MT5 connection closed.")


if __name__ == "__main__":
    main()
