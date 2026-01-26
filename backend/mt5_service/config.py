# backend/mt5_service/config.py
# Configuration for MT5 Signal Engine

import os
from dotenv import load_dotenv

load_dotenv()

# Supabase Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '')

# MT5 Configuration - can be overridden via environment
MT5_LOGIN = int(os.getenv('MT5_LOGIN', '0'))
MT5_PASSWORD = os.getenv('MT5_PASSWORD', '')
MT5_SERVER = os.getenv('MT5_SERVER', '')

# Timeframes to monitor (MT5 constants)
TIMEFRAMES = ['H1', 'H4']

# Strategy Settings
BUFFER_SIZE = 200  # Number of candles to keep for indicator calculations
DUPLICATE_LOOKBACK_MINUTES = 60  # Prevent duplicate signals within this period
