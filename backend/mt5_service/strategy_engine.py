# backend/mt5_service/strategy_engine.py
# Strategy Evaluation Engine for MT5 Data

from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from enum import Enum
from indicators import calculate_sma, calculate_ema, calculate_rsi, calculate_bollinger_bands, detect_crossover


class TradeDirection(Enum):
    BUY = 'BUY'
    SELL = 'SELL'


@dataclass
class SignalResult:
    triggered: bool
    direction: Optional[TradeDirection] = None
    reason: str = ''
    strategy_id: str = ''
    strategy_name: str = ''


# Built-in Strategies Definition (MATCHED TO NODE.JS ENGINE)
BUILT_IN_STRATEGIES = [
    {
        'id': '11111111-1111-1111-1111-111111111111', # Matches Node.js UUID
        'name': 'SMA Trend Strategy',
        'indicators': [
            {'type': 'SMA', 'period': 20}
        ],
        'rules': [
            {'condition': 'greater_than', 'ind1': 'CLOSE', 'ind2': 'SMA_20', 'direction': TradeDirection.BUY},
            {'condition': 'less_than', 'ind1': 'CLOSE', 'ind2': 'SMA_20', 'direction': TradeDirection.SELL}
        ]
    },
    {
        'id': '22222222-2222-2222-2222-222222222222', # Matches Node.js UUID
        'name': 'EMA Trend Strategy',
        'indicators': [
            {'type': 'EMA', 'period': 20}
        ],
        'rules': [
            {'condition': 'greater_than', 'ind1': 'CLOSE', 'ind2': 'EMA_20', 'direction': TradeDirection.BUY},
            {'condition': 'less_than', 'ind1': 'CLOSE', 'ind2': 'EMA_20', 'direction': TradeDirection.SELL}
        ]
    }
]


def calculate_indicator(indicator_type: str, closes: List[float], params: Dict) -> Dict[str, List]:
    """Calculate an indicator and return its series"""
    if indicator_type == 'SMA':
        return {'main': calculate_sma(closes, params.get('period', 20))}
    elif indicator_type == 'EMA':
        return {'main': calculate_ema(closes, params.get('period', 20))}
    elif indicator_type == 'RSI':
        return {'main': calculate_rsi(closes, params.get('period', 14))}
    elif indicator_type == 'BOLLINGER_BANDS':
        return calculate_bollinger_bands(closes, params.get('period', 20), params.get('std_dev', 2))
    return {'main': [None] * len(closes)}


def get_series(key: str, indicators: Dict, closes: List[float]) -> Optional[List]:
    """Get indicator series by key"""
    if key == 'CLOSE':
        return closes
    
    if key in indicators and 'main' in indicators[key]:
        return indicators[key]['main']
    
    # Handle BB_upper, BB_lower etc.
    if key.startswith('BB_'):
        subkey = key.split('_')[1]
        if 'BOLLINGER_BANDS_20' in indicators and subkey in indicators['BOLLINGER_BANDS_20']:
            return indicators['BOLLINGER_BANDS_20'][subkey]
    
    return None


def evaluate_rule(rule: Dict, indicators: Dict, closes: List[float]) -> SignalResult:
    """Evaluate a single entry rule"""
    latest_idx = len(closes) - 1
    
    condition = rule['condition']
    
    if condition in ['crossover', 'crossunder']:
        series1 = get_series(rule['ind1'], indicators, closes)
        series2 = get_series(rule['ind2'], indicators, closes)
        
        if series1 is None or series2 is None:
            return SignalResult(False, reason='Missing indicator data')
        
        crossover = detect_crossover(series1, series2, latest_idx)
        
        if condition == 'crossover' and crossover == 'up':
            return SignalResult(True, rule['direction'], f"{rule['ind1']} crossed above {rule['ind2']}")
        if condition == 'crossunder' and crossover == 'down':
            return SignalResult(True, rule['direction'], f"{rule['ind1']} crossed below {rule['ind2']}")
        
        return SignalResult(False, reason='No crossover detected')
    
    elif condition in ['greater_than', 'less_than']:
        series = get_series(rule['ind1'], indicators, closes)
        series2 = None
        
        if rule.get('ind2') and rule['ind2'] != 'CLOSE': # Handle indicator comparison if needed
             series2 = get_series(rule['ind2'], indicators, closes)

        if series is None or series[latest_idx] is None:
            return SignalResult(False, reason='Missing indicator data')
        
        current_value = series[latest_idx]
        
        # Determine target value (either fixed value or another indicator)
        target_value = 0
        if series2:
             if series2[latest_idx] is None:
                  return SignalResult(False, reason='Missing indicator2 data')
             target_value = series2[latest_idx]
        else:
             target_value = rule.get('value', 0)
        
        if condition == 'greater_than' and current_value > target_value:
            return SignalResult(True, rule['direction'], f"{rule['ind1']} ({current_value:.2f}) > {target_value:.2f}")
        if condition == 'less_than' and current_value < target_value:
            return SignalResult(True, rule['direction'], f"{rule['ind1']} ({current_value:.2f}) < {target_value:.2f}")
        
        return SignalResult(False, reason='Condition not met')
    
    return SignalResult(False, reason='Unknown condition')


def run_strategy(strategy: Dict, closes: List[float]) -> List[SignalResult]:
    """Run a strategy against price data"""
    if len(closes) < 50:
        return []
    
    # Calculate all indicators
    indicators = {}
    for ind in strategy['indicators']:
        key = f"{ind['type']}_{ind.get('period', 'default')}"
        indicators[key] = calculate_indicator(ind['type'], closes, ind)
    
    # Evaluate rules
    results = []
    for rule in strategy['rules']:
        result = evaluate_rule(rule, indicators, closes)
        if result.triggered:
            result.strategy_id = strategy['id']
            result.strategy_name = strategy['name']
            results.append(result)
    
    return results


def run_all_strategies(closes: List[float]) -> List[SignalResult]:
    """Run all built-in strategies against price data"""
    all_results = []
    for strategy in BUILT_IN_STRATEGIES:
        results = run_strategy(strategy, closes)
        all_results.extend(results)
    return all_results


def calculate_risk_levels(entry_price: float, direction: TradeDirection) -> Dict[str, float]:
    """Calculate stop loss and take profit levels"""
    risk_pct = 0.02  # 2% risk
    reward_pct = 0.04  # 4% reward (1:2 RR)
    
    if direction == TradeDirection.BUY:
        return {
            'stop_loss': entry_price * (1 - risk_pct),
            'take_profit': entry_price * (1 + reward_pct)
        }
    else:
        return {
            'stop_loss': entry_price * (1 + risk_pct),
            'take_profit': entry_price * (1 - reward_pct)
        }
