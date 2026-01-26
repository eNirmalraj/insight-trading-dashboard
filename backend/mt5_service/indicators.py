# backend/mt5_service/indicators.py
# Technical Indicator Calculations for Strategy Engine

from typing import List, Optional, Dict
import math


def calculate_sma(data: List[float], period: int) -> List[Optional[float]]:
    """Calculate Simple Moving Average"""
    if period > len(data) or period <= 0:
        return [None] * len(data)
    
    sma = []
    for i in range(len(data)):
        if i < period - 1:
            sma.append(None)
        else:
            sma.append(sum(data[i - period + 1:i + 1]) / period)
    return sma


def calculate_ema(data: List[float], period: int) -> List[Optional[float]]:
    """Calculate Exponential Moving Average"""
    if period > len(data) or period <= 0:
        return [None] * len(data)
    
    ema = []
    multiplier = 2 / (period + 1)
    prev_ema = None
    
    for i, price in enumerate(data):
        if prev_ema is None:
            if i >= period - 1:
                # Initialize with SMA
                prev_ema = sum(data[i - period + 1:i + 1]) / period
                ema.append(prev_ema)
            else:
                ema.append(None)
        else:
            current_ema = (price - prev_ema) * multiplier + prev_ema
            ema.append(current_ema)
            prev_ema = current_ema
    
    return ema


def calculate_rsi(closes: List[float], period: int = 14) -> List[Optional[float]]:
    """Calculate RSI"""
    if period >= len(closes) or period <= 0:
        return [None] * len(closes)
    
    rsi = [None] * period
    
    # Calculate initial average gain/loss
    gains = 0
    losses = 0
    for i in range(1, period + 1):
        change = closes[i] - closes[i - 1]
        if change > 0:
            gains += change
        else:
            losses -= change
    
    avg_gain = gains / period
    avg_loss = losses / period
    
    # First RSI value
    if avg_loss == 0:
        rsi.append(100)
    else:
        rs = avg_gain / avg_loss
        rsi.append(100 - (100 / (1 + rs)))
    
    # Subsequent values
    for i in range(period + 1, len(closes)):
        change = closes[i] - closes[i - 1]
        current_gain = max(change, 0)
        current_loss = max(-change, 0)
        
        avg_gain = (avg_gain * (period - 1) + current_gain) / period
        avg_loss = (avg_loss * (period - 1) + current_loss) / period
        
        if avg_loss == 0:
            rsi.append(100)
        else:
            rs = avg_gain / avg_loss
            rsi.append(100 - (100 / (1 + rs)))
    
    return rsi


def calculate_bollinger_bands(data: List[float], period: int = 20, std_dev: float = 2) -> Dict[str, List[Optional[float]]]:
    """Calculate Bollinger Bands"""
    sma = calculate_sma(data, period)
    upper = []
    lower = []
    
    for i in range(len(data)):
        if sma[i] is None:
            upper.append(None)
            lower.append(None)
        else:
            # Calculate standard deviation
            window = data[i - period + 1:i + 1]
            mean = sma[i]
            variance = sum((x - mean) ** 2 for x in window) / period
            sd = math.sqrt(variance)
            
            upper.append(mean + (sd * std_dev))
            lower.append(mean - (sd * std_dev))
    
    return {'upper': upper, 'middle': sma, 'lower': lower}


def detect_crossover(series1: List[Optional[float]], series2: List[Optional[float]], index: int) -> Optional[str]:
    """Detect crossover between two series"""
    if index < 1:
        return None
    
    current1, current2 = series1[index], series2[index]
    prev1, prev2 = series1[index - 1], series2[index - 1]
    
    if any(v is None for v in [current1, current2, prev1, prev2]):
        return None
    
    if prev1 < prev2 and current1 > current2:
        return 'up'
    if prev1 > prev2 and current1 < current2:
        return 'down'
    
    return None
