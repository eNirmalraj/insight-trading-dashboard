/**
 * Indicator Registry — exports all 18 default indicators with metadata.
 * .kuri source is inlined via raw import (Vite ?raw suffix).
 * Used by: IndicatorPickerModal, Strategy Studio templates, Signal page.
 */

import smaSource from './sma.kuri?raw';
import emaSource from './ema.kuri?raw';
import wmaSource from './wma.kuri?raw';
import maRibbonSource from './ma-ribbon.kuri?raw';
import macdSource from './macd.kuri?raw';
import rsiSource from './rsi.kuri?raw';
import adrSource from './adr.kuri?raw';
import atrSource from './atr.kuri?raw';
import bbSource from './bb.kuri?raw';
import supertrendSource from './supertrend.kuri?raw';
import donchianSource from './donchian.kuri?raw';
import ichimokuSource from './ichimoku.kuri?raw';
import keltnerSource from './keltner.kuri?raw';
import stochasticSource from './stochastic.kuri?raw';
import vwmaSource from './vwma.kuri?raw';
import hmaSource from './hma.kuri?raw';
import cciSource from './cci.kuri?raw';
import obvSource from './obv.kuri?raw';
import vwapSource from './vwap.kuri?raw';
import volumeSource from './volume.kuri?raw';
import mfiSource from './mfi.kuri?raw';
import adxSource from './adx.kuri?raw';
import mflSource from './money-flow-levels.kuri?raw';
import testAllDrawingsSource from './test-all-drawings.kuri?raw';

export type IndicatorCategory = 'trend' | 'volatility' | 'oscillator' | 'volume';

export interface IndicatorMeta {
    id: string;
    name: string;
    shortname: string;
    category: IndicatorCategory;
    overlay: boolean;
    kuriSource: string;
}

export const DEFAULT_INDICATORS: IndicatorMeta[] = [
    // ── Trend ──
    {
        id: 'sma',
        name: 'Simple Moving Average',
        shortname: 'SMA',
        category: 'trend',
        overlay: true,
        kuriSource: smaSource,
    },
    {
        id: 'ema',
        name: 'Exponential Moving Average',
        shortname: 'EMA',
        category: 'trend',
        overlay: true,
        kuriSource: emaSource,
    },
    {
        id: 'wma',
        name: 'Weighted Moving Average',
        shortname: 'WMA',
        category: 'trend',
        overlay: true,
        kuriSource: wmaSource,
    },
    {
        id: 'hma',
        name: 'Hull Moving Average',
        shortname: 'HMA',
        category: 'trend',
        overlay: true,
        kuriSource: hmaSource,
    },
    {
        id: 'ma-ribbon',
        name: 'Moving Average Ribbon',
        shortname: 'MA Ribbon',
        category: 'trend',
        overlay: true,
        kuriSource: maRibbonSource,
    },
    {
        id: 'supertrend',
        name: 'Supertrend',
        shortname: 'Supertrend',
        category: 'trend',
        overlay: true,
        kuriSource: supertrendSource,
    },
    {
        id: 'ichimoku',
        name: 'Ichimoku Cloud',
        shortname: 'Ichimoku',
        category: 'trend',
        overlay: true,
        kuriSource: ichimokuSource,
    },

    // ── Volatility ──
    {
        id: 'bb',
        name: 'Bollinger Bands',
        shortname: 'BB',
        category: 'volatility',
        overlay: true,
        kuriSource: bbSource,
    },
    {
        id: 'atr',
        name: 'Average True Range',
        shortname: 'ATR',
        category: 'volatility',
        overlay: false,
        kuriSource: atrSource,
    },
    {
        id: 'adr',
        name: 'Average Daily Range',
        shortname: 'ADR',
        category: 'volatility',
        overlay: false,
        kuriSource: adrSource,
    },
    {
        id: 'keltner',
        name: 'Keltner Channels',
        shortname: 'KC',
        category: 'volatility',
        overlay: true,
        kuriSource: keltnerSource,
    },
    {
        id: 'donchian',
        name: 'Donchian Channels',
        shortname: 'DC',
        category: 'volatility',
        overlay: true,
        kuriSource: donchianSource,
    },

    // ── Oscillators ──
    {
        id: 'rsi',
        name: 'Relative Strength Index',
        shortname: 'RSI',
        category: 'oscillator',
        overlay: false,
        kuriSource: rsiSource,
    },
    {
        id: 'macd',
        name: 'MACD',
        shortname: 'MACD',
        category: 'oscillator',
        overlay: false,
        kuriSource: macdSource,
    },
    {
        id: 'stochastic',
        name: 'Stochastic',
        shortname: 'Stoch',
        category: 'oscillator',
        overlay: false,
        kuriSource: stochasticSource,
    },
    {
        id: 'cci',
        name: 'Commodity Channel Index',
        shortname: 'CCI',
        category: 'oscillator',
        overlay: false,
        kuriSource: cciSource,
    },

    // ── Volume ──
    {
        id: 'obv',
        name: 'On Balance Volume',
        shortname: 'OBV',
        category: 'volume',
        overlay: false,
        kuriSource: obvSource,
    },
    {
        id: 'vwma',
        name: 'Volume Weighted Moving Average',
        shortname: 'VWMA',
        category: 'volume',
        overlay: true,
        kuriSource: vwmaSource,
    },
    {
        id: 'vwap',
        name: 'Volume Weighted Average Price',
        shortname: 'VWAP',
        category: 'volume',
        overlay: true,
        kuriSource: vwapSource,
    },
    {
        id: 'volume',
        name: 'Volume',
        shortname: 'Vol',
        category: 'volume',
        overlay: false,
        kuriSource: volumeSource,
    },
    {
        id: 'mfi',
        name: 'Money Flow Index',
        shortname: 'MFI',
        category: 'oscillator',
        overlay: false,
        kuriSource: mfiSource,
    },
    {
        id: 'adx',
        name: 'Average Directional Index',
        shortname: 'ADX',
        category: 'oscillator',
        overlay: false,
        kuriSource: adxSource,
    },
    // ── Advanced ──
    {
        id: 'money-flow-levels',
        name: 'Money Flow Levels',
        shortname: 'MFL',
        category: 'trend',
        overlay: true,
        kuriSource: mflSource,
    },
    {
        id: 'test-all-drawings',
        name: 'All Drawings Test',
        shortname: 'ADT',
        category: 'trend',
        overlay: true,
        kuriSource: testAllDrawingsSource,
    },
];

/** Look up a default indicator by ID */
export function getDefaultIndicator(id: string): IndicatorMeta | undefined {
    return DEFAULT_INDICATORS.find((ind) => ind.id === id);
}

/** Get all indicators in a given category */
export function getIndicatorsByCategory(category: IndicatorCategory): IndicatorMeta[] {
    return DEFAULT_INDICATORS.filter((ind) => ind.category === category);
}

/** All unique categories in display order */
export const INDICATOR_CATEGORIES: IndicatorCategory[] = [
    'trend',
    'volatility',
    'oscillator',
    'volume',
];
