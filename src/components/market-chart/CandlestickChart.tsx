import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Position, PositionStatus, TradeDirection, Strategy } from '../../types';
import CreateAlertModal from '../CreateAlertModal';
import * as api from '../../api';
import indicatorService from '../../services/indicatorService';
import * as priceAlertService from '../../services/alertService';
import { saveMarketState } from '../../services/marketStateService';
import { saveDrawings } from '../../services/chartDrawingService';
import { convertKuriDrawings, getKuriTables } from './kuriDrawingConverter';
import KuriTableOverlay from './KuriTableOverlay';
import { getCandles } from '../../services/marketDataService';
import { alertEngine } from '../../engine/alertEngine';
import {
    Candle,
    Drawing,
    CurrentDrawingState,
    PriceAlert,
    TooltipData,
    ViewState,
    PriceRange,
    InteractionState,
    Indicator,
    IndicatorType,
    IndicatorSettings,
    Point,
    TextNoteDrawing,
    DrawingStyle,
    HorizontalLineDrawing,
    CurrentDrawing,
    ChartSettings,
    AlertConditionType,
    OrderDetails,
    PlacingOrderLine,
    VerticalLineDrawing,
    CalloutDrawing,
    PathDrawing,
    BrushDrawing,
} from './types';
import {
    MIN_CANDLES,
    RIGHT_SIDE_PADDING_CANDLES,
    HITBOX_WIDTH,
    HANDLE_RADIUS,
    SNAP_THRESHOLD,
    FIB_LEVELS,
    GANN_LEVELS,
    GANN_LEVEL_COLORS,
} from './constants';
import { calculateIndicator } from './helpers';
import { ChartError, toChartErrorFromString } from './errorUtils';
import { Kuri, Context, SecurityDataFetcher } from '@insight/kuri-engine';
import ChartHeader from './ChartHeader';
// import LeftToolbar from './LeftToolbar'; // Removed, functionality moved to BottomPanel
import RightToolbar from './RightToolbar';
import BottomPanel from './BottomPanel';
import ChartNavigation from './ChartNavigation';
import { SidePanels } from './SidePanels';
import FloatingDrawingToolbar from './FloatingDrawingToolbar';
import { IndicatorPanel, IndicatorSettingsModal } from './IndicatorPanels';
import ChartSettingsModal from './ChartSettingsModal';
import ActiveIndicatorsDisplay from './ActiveIndicatorsDisplay';
import ContextMenu from './ContextMenu';
import TemplateManagerModal from './TemplateManagerModal';
import { SettingsIcon } from '../IconComponents';
import { AlertMarkers } from './AlertMarkers'; // Import AlertMarkers
import { MobileDrawingToolsModal, MobileMoreMenu } from './mobile';
import { useResponsive } from '../../hooks/useResponsive';
import { getIndicatorDefinition } from '../../data/builtInIndicators';

const FIB_LEVEL_COLORS = [
    'rgba(128, 0, 128, 0.2)', // Purple for 0-0.236
    'rgba(0, 0, 255, 0.2)', // Blue for 0.236-0.382
    'rgba(0, 128, 0, 0.2)', // Green for 0.382-0.5
    'rgba(255, 255, 0, 0.2)', // Yellow for 0.5-0.618
    'rgba(255, 165, 0, 0.2)', // Orange for 0.618-0.786
    'rgba(255, 0, 0, 0.2)', // Red for 0.786-1
];

interface HistoryState {
    drawings: Drawing[];
    indicators: Indicator[];
    view: { startIndex: number; visibleCandles: number };
    priceRange: { min: number; max: number } | null;
    isAutoScaling: boolean;
    chartType: 'Candle' | 'Line';
}

const getDefaultChartSettings = (symbol: string): ChartSettings => ({
    symbol: {
        showBody: true,
        showBorders: true,
        showWick: true,
        bodyUpColor: '#089981',
        bodyDownColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        colorBarsOnPrevClose: false,
        precision: 'Default',
        timezone: 'Etc/UTC',
    },
    statusLine: {
        showOhlc: true,
        showBarChange: true,
        showVolume: true,
        showIndicatorTitles: true,
        showIndicatorValues: true,
    },
    scalesAndLines: {
        showLastPriceLabel: true,
        showPriceLabels: true,
        gridColor: 'rgba(47, 47, 47, 0.5)',
        crosshairColor: '#A9A9A9',
        showCountdown: true,
        showGrid: true,
        showCrosshair: true,
        dateFormat: 'DD-MM-YYYY',
        timeFormat: 'hh:mm',
    },
    canvas: {
        backgroundType: 'solid',
        backgroundColor: '#0f0f0f',
        gradientStartColor: '#121212',
        gradientEndColor: '#0f0f0f',
        textColor: '#E0E0E0',
        showWatermark: false,
        watermarkText: symbol,
        watermarkColor: 'rgba(156, 163, 175, 0.1)',
    },
});

const getTextColorForBackground = (hexColor: string): string => {
    if (!hexColor || !hexColor.startsWith('#')) return '#FFFFFF';
    const hex = hexColor.slice(1);
    if (hex.length !== 6) return '#FFFFFF';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#000000' : '#FFFFFF';
};

const getDefaultIndicatorSettings = (type: IndicatorType): IndicatorSettings => {
    switch (type) {
        // Moving Averages
        case 'MA':
        case 'SMA':
            return { period: 20, color: '#3B82F6' };
        case 'EMA':
            return { period: 20, color: '#FBBF24' };
        case 'WMA':
            return { period: 20, color: '#10B981' };
        case 'VWMA':
            return { period: 20, color: '#EC4899' };
        case 'HMA':
            return { period: 20, color: '#8B5CF6' };
        case 'MA Ribbon':
            return { ribbonPeriods: '10,20,30,40,50,60', ribbonBaseColor: '#2962FF' };

        // Oscillators
        case 'RSI':
            return { period: 14, color: '#A78BFA' };
        case 'MACD':
            return {
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                macdColor: '#2962FF',
                signalColor: '#FF6D00',
                histogramUpColor: '#4CAF50',
                histogramDownColor: '#F44336',
            };
        case 'Stochastic':
            return { kPeriod: 14, kSlowing: 3, dPeriod: 3, kColor: '#2962FF', dColor: '#FF6D00' };
        case 'CCI':
            return { period: 20, color: '#FBBF24' };
        case 'MFI':
            return { period: 14, color: '#3B82F6' };
        case 'ADX':
            return { period: 14, color: '#F59E0B' };

        // Volatility
        case 'BB':
        case 'Bollinger Bands':
            return {
                period: 20,
                stdDev: 2,
                upperColor: '#2962FF',
                middleColor: '#FF6D00',
                lowerColor: '#2962FF',
            };
        case 'ATR':
            return { period: 14, color: '#EF4444' };
        case 'SuperTrend':
            return { atrPeriod: 10, factor: 3, upColor: '#4CAF50', downColor: '#F44336' };

        // Volume
        case 'VWAP':
            return { color: '#EC4899' };
        case 'OBV':
            return { color: '#10B981' };
        case 'Volume':
            return { volumeUpColor: '#10B981', volumeDownColor: '#EF4444' };

        // Channels (match both registry ID and legacy/short names)
        case 'DONCHIAN':
        case 'DC':
            return { period: 20, color: '#FF6D00' };
        case 'ICHIMOKU':
        case 'Ichimoku':
            return { period: 9 };
        case 'KELTNER':
        case 'KC':
            return { period: 20, multiplier: 2, color: '#2962FF' };
        case 'ADR':
            return { period: 14, color: '#2962FF' };
        case 'KURI_LINE':
        case 'KURI_AREA':
        case 'KURI_HISTOGRAM':
        case 'KURI_BAND':
        case 'KURI_COLUMNS':
        case 'KURI_MARKERS':
            return { color: '#FF9800' };

        default:
            return {};
    }
};

const extractDefaults = (parameters: any[]) => {
    const defaults: any = {};
    if (parameters) {
        parameters.forEach((p) => (defaults[p.name] = p.default));
    }
    return defaults;
};

import { registry } from '../../core/registry/IndicatorRegistry';
import { shouldUseRegistryFor } from '../../core/config/featureFlags';

const getIndicatorDefaults = (type: IndicatorType) => {
    if (shouldUseRegistryFor(type)) {
        const def = registry.getIndicator(type);
        if (def) {
            return extractDefaults(def.parameters);
        }
    }
    return getDefaultIndicatorSettings(type);
};

const calculateIndicatorData = (indicator: Indicator, data: Candle[]) => {
    switch (indicator.type) {
        case 'Volume':
            return { main: data.map((c) => c.volume || 0) };
        case 'KURI_LINE':
        case 'KURI_AREA':
        case 'KURI_HISTOGRAM':
        case 'KURI_BAND':
        case 'KURI_COLUMNS':
        case 'KURI_MARKERS':
            // Pre-computed by Kuri engine — return as-is
            return indicator.data;
        default: {
            const result = calculateIndicator(indicator.type, data, indicator.settings);
            if (result.ok) {
                return result.data;
            }
            console.warn(`Indicator calculation failed for ${indicator.type}: ${result.error}`);
            return {};
        }
    }
};

// Helper function to feed indicator values to AlertEngine
const feedIndicatorToAlertEngine = (indicator: Indicator) => {
    try {
        // Get the latest values from indicator data
        const latestValues: Record<string, number | null> = {};

        // Generic data extraction for ALL indicators
        const keys = Object.keys(indicator.data);
        keys.forEach((key) => {
            const series = indicator.data[key];
            if (Array.isArray(series) && series.length > 0) {
                // Get the last value (most recent)
                // Note: handling both number[] and (number|null)[]
                const val = series[series.length - 1];
                if (typeof val === 'number') {
                    latestValues[key] = val;
                } else if (val === null) {
                    latestValues[key] = null;
                }
            }
        });

        // Feed values to alert engine
        if (Object.keys(latestValues).length > 0) {
            alertEngine.setIndicatorValues(indicator.id, latestValues);
        }

        // Register indicator definition (for alertConditions)
        const indicatorDef = getIndicatorDefinition(indicator.type);
        if (indicatorDef) {
            alertEngine.setIndicatorDefinition(indicator.id, indicatorDef);
        }
    } catch (error) {
        console.error('[Chart] Error feeding indicator to AlertEngine:', error);
    }
};

interface HistoryState {
    drawings: Drawing[];
    indicators: Indicator[];
    view: ViewState;
    priceRange: PriceRange;
    isAutoScaling: boolean;
}

interface LabelInfo {
    price: number;
    color: string;
    text?: string;
    text1?: string;
    text2?: string;
}

// Mobile-Specific Components
// Now imported from './mobile' directory

interface CandlestickChartProps {
    data: Candle[];
    tools: { icon: React.ReactNode; name: string; category: string }[];
    symbol: string;
    onSymbolChange: (symbol: string) => void;
    allTimeframes: string[];
    favoriteTimeframes: string[];
    activeTimeframe: string;
    onTimeframeChange: (tf: string) => void;
    onToggleFavorite: (tf: string) => void;
    onAddCustomTimeframe: (tf: string) => void;
    onLogout: () => void;
    onToggleMobileSidebar: () => void;
    initialSettings?: ChartSettings | null;
    onSettingsChange?: (settings: ChartSettings) => void;
    strategyVisibility?: Record<string, boolean>;

    onToggleStrategyVisibility?: (id: string, visible: boolean) => void;
    initialDrawings?: Drawing[];
    onDrawingsChange?: (drawings: Drawing[]) => void;
    customScripts?: Strategy[];
    autoAddScriptId?: string | null;
    onAutoAddComplete?: () => void;
    onChartError?: (error: ChartError) => void;
    onClearErrors?: (source?: string) => void;
}

const CandlestickChart: React.FC<CandlestickChartProps> = (props) => {
    const {
        data,
        tools,
        symbol,
        activeTimeframe,
        onSymbolChange,
        onAddCustomTimeframe,
        onToggleMobileSidebar,
        initialSettings,
        onSettingsChange,
        strategyVisibility,
        onToggleStrategyVisibility,
        customScripts = [],
        autoAddScriptId,
        onAutoAddComplete,
        initialDrawings,
        onDrawingsChange,
        onChartError,
        onClearErrors,
    } = props;
    const svgRef = useRef<SVGSVGElement>(null);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const [kuriTables, setKuriTables] = useState<any[]>([]);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const eventContainerRef = useRef<HTMLDivElement>(null);
    const yAxisCanvasRef = useRef<HTMLCanvasElement>(null);
    const yAxisContainerRef = useRef<HTMLDivElement>(null);
    const xAxisCanvasRef = useRef<HTMLCanvasElement>(null);
    const xAxisContainerRef = useRef<HTMLDivElement>(null);
    const textInputRef = useRef<HTMLTextAreaElement>(null);
    const indicatorPanelsContainerRef = useRef<HTMLDivElement>(null);
    const activePointers = useRef(new Map<number, { x: number; y: number }>());
    const fullscreenContainerRef = useRef<HTMLDivElement>(null);
    const viewInteractionStartState = useRef<HistoryState | null>(null);
    const isAimingRef = useRef(false);
    const tapDetectionRef = useRef<{
        x: number;
        y: number;
        time: number;
        wasVisible: boolean;
    } | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { isMobile } = useResponsive();

    const [isMobileDrawingModalOpen, setMobileDrawingModalOpen] = useState(false);
    const [isMobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);

    const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
    const [yAxisDimensions, setYAxisDimensions] = useState({ width: 0, height: 0 });
    const [xAxisDimensions, setXAxisDimensions] = useState({ width: 0, height: 0 });

    const [view, setView] = useState<ViewState>({
        startIndex: Math.max(0, data.length - 60),
        visibleCandles: Math.min(60, data.length),
    });
    const [tooltip, setTooltip] = useState<TooltipData>({ visible: false, x: 0, y: 0, data: null });

    const [interaction, setInteraction] = useState<InteractionState>({ type: 'none' });
    const [activeTool, setActiveTool] = useState<string | null>(null);

    // Auto-scroll to latest data when data loads from empty
    const prevDataLength = useRef(0);
    useEffect(() => {
        if (data.length > 0 && prevDataLength.current === 0) {
            const defaultVisible = Math.min(60, data.length);
            const start = Math.max(0, data.length - defaultVisible - 5); // 5 candle padding from right
            setView({ startIndex: start, visibleCandles: defaultVisible });
        }
        prevDataLength.current = data.length;
    }, [data.length]);

    const [drawings, setDrawings] = useState<Drawing[]>(initialDrawings || []);

    // Sync changes to parent
    useEffect(() => {
        if (onDrawingsChange) {
            onDrawingsChange(drawings);
        }
    }, [drawings, onDrawingsChange]);

    // Update internal state when initialDrawings prop changes (e.g. symbol switch)
    useEffect(() => {
        if (initialDrawings) {
            setDrawings(initialDrawings);
        }
    }, [initialDrawings]);

    const [currentDrawing, setCurrentDrawing] = useState<CurrentDrawingState>(null);
    const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
    const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

    const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

    const [bottomPanelTab, setBottomPanelTab] = useState('Positions');
    const [isBottomPanelOpen, setBottomPanelOpen] = useState(false);

    // Console logging for indicator diagnostics
    const [consoleLogs, setConsoleLogs] = useState<import('./BottomPanel').ConsoleLog[]>([]);
    const addConsoleLog = useCallback(
        (level: 'info' | 'warn' | 'error', source: string, message: string, details?: string) => {
            setConsoleLogs((prev) => [
                ...prev.slice(-499), // keep last 500 logs
                {
                    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    timestamp: new Date(),
                    level,
                    source,
                    message,
                    details,
                },
            ]);
        },
        []
    );
    const clearConsoleLogs = useCallback(() => {
        setConsoleLogs([]);
        loggedIndicatorWarnings.current.clear();
    }, []);
    const loggedIndicatorWarnings = useRef<Set<string>>(new Set());

    const handleToggleConsole = useCallback(() => {
        if (!isBottomPanelOpen) {
            setBottomPanelOpen(true);
            setBottomPanelTab('Console');
        } else if (bottomPanelTab === 'Console') {
            setBottomPanelOpen(false);
        } else {
            setBottomPanelTab('Console');
        }
    }, [isBottomPanelOpen, bottomPanelTab]);

    const [priceRange, setPriceRange] = useState<PriceRange>({ min: 0, max: 0 });
    const [isAutoScaling, setIsAutoScaling] = useState(true);
    const [headerOhlc, setHeaderOhlc] = useState<Candle | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [alerts, setAlerts] = useState<PriceAlert[]>([]);

    const [editingText, setEditingText] = useState<{
        drawing: TextNoteDrawing | CalloutDrawing;
        x: number;
        y: number;
    } | null>(null);
    const [snapIndicator, setSnapIndicator] = useState<{ x: number; y: number } | null>(null);
    const [rightPanel, setRightPanel] = useState<
        'watchlist' | 'alerts' | 'dataWindow' | 'orderPanel' | 'objectTree' | null
    >(null);
    const [alertModalInfo, setAlertModalInfo] = useState<{
        visible: boolean;
        drawing: Drawing | null;
        alertToEdit?: PriceAlert | null;
        indicatorId?: string; // NEW: For indicator alerts
        indicatorType?: string; // NEW: Indicator type (RSI, SMA, etc.)
    }>({ visible: false, drawing: null, alertToEdit: null });

    const [isIndicatorPanelOpen, setIndicatorPanelOpen] = useState(false);
    const [allActiveIndicators, setAllActiveIndicators] = useState<Indicator[]>([]);
    const [indicatorToEdit, setIndicatorToEdit] = useState<Indicator | null>(null);
    const [indicatorsLoaded, setIndicatorsLoaded] = useState(false); // Track if indicators are loaded from DB
    const indicatorCanvasRefs = useRef<
        Map<string, { chart: HTMLCanvasElement | null; yAxis: HTMLCanvasElement | null }>
    >(new Map());

    const [floatingToolbarPos, setFloatingToolbarPos] = useState<{ x: number; y: number } | null>(
        null
    );
    const [chartType, setChartType] = useState<'Candle' | 'Line'>('Candle');
    const [countdown, setCountdown] = useState<string | null>(null);

    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        price: number;
        time: number;
        visible: boolean;
        drawing?: Drawing;
    } | null>(null);

    const [lockedVerticalLineTime, setLockedVerticalLineTime] = useState<number | null>(null);
    const [chartSettings, setChartSettings] = useState<ChartSettings>(() => {
        // Use prop if available initially
        if (props.initialSettings) return props.initialSettings;

        const defaults = getDefaultChartSettings(props.symbol);
        try {
            const savedSettingsJSON = localStorage.getItem(`chartSettings_${props.symbol}`);
            if (savedSettingsJSON) {
                const savedSettings = JSON.parse(savedSettingsJSON);
                if (!savedSettings.symbol || !savedSettings.canvas) {
                    return defaults;
                }
                const merged = {
                    symbol: { ...defaults.symbol, ...savedSettings.symbol },
                    statusLine: { ...defaults.statusLine, ...savedSettings.statusLine },
                    scalesAndLines: { ...defaults.scalesAndLines, ...savedSettings.scalesAndLines },
                    canvas: { ...defaults.canvas, ...savedSettings.canvas },
                };
                // Migrate old candle colors to new palette
                const oldUp = '#08CFAC',
                    oldDown = '#CF082B';
                const s = merged.symbol;
                if (s.bodyUpColor === oldUp) s.bodyUpColor = defaults.symbol.bodyUpColor;
                if (s.bodyDownColor === oldDown) s.bodyDownColor = defaults.symbol.bodyDownColor;
                if (s.borderUpColor === oldUp) s.borderUpColor = defaults.symbol.borderUpColor;
                if (s.borderDownColor === oldDown)
                    s.borderDownColor = defaults.symbol.borderDownColor;
                if (s.wickUpColor === oldUp) s.wickUpColor = defaults.symbol.wickUpColor;
                if (s.wickDownColor === oldDown) s.wickDownColor = defaults.symbol.wickDownColor;
                // Migrate old dim text color
                if (merged.canvas.textColor === '#A9A9A9' || merged.canvas.textColor === '#E0E0E0')
                    merged.canvas.textColor = defaults.canvas.textColor;
                return merged;
            }
        } catch (error) {
            console.error('Failed to load chart settings:', error);
        }
        return defaults;
    });

    // Update settings when prop changes (external load)
    useEffect(() => {
        if (initialSettings) {
            setChartSettings((prev) => {
                // simple deep comparison or just overwrite?
                // Overwrite safely merging with defaults to ensure completeness
                const defaults = getDefaultChartSettings(symbol);
                return {
                    symbol: { ...defaults.symbol, ...initialSettings.symbol },
                    statusLine: { ...defaults.statusLine, ...initialSettings.statusLine },
                    scalesAndLines: {
                        ...defaults.scalesAndLines,
                        ...initialSettings.scalesAndLines,
                    },
                    canvas: { ...defaults.canvas, ...initialSettings.canvas },
                };
            });
        }
    }, [initialSettings, symbol]);

    // Notify parent of changes
    useEffect(() => {
        if (onSettingsChange) {
            onSettingsChange(chartSettings);
        }
    }, [chartSettings, onSettingsChange]);

    const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);

    const [bottomPanelHeight, setBottomPanelHeight] = useState(150);
    const [rightPanelWidth, setRightPanelWidth] = useState(320);

    // Mobile Panel State
    const [mobilePanelHeight, setMobilePanelHeight] = useState(400);

    const [order, setOrder] = useState<OrderDetails>({
        quantity: '0.10',
        sl: '',
        tp: '',
        price: '',
        riskPercent: '1.0',
        leverage: 20,
        marginMode: 'Cross',
        reduceOnly: false,
        postOnly: false,
    });
    const [placingOrderLine, setPlacingOrderLine] = useState<PlacingOrderLine>(null);
    const [tempOrderLinePrice, setTempOrderLinePrice] = useState<number | null>(null);
    const [forexBalanceValue, setForexBalanceValue] = useState(0);
    const [binanceBalanceValue, setBinanceBalanceValue] = useState(0);
    const [positions, setPositions] = useState<Position[]>([]);

    const handleToggleBottomPanel = () => {
        const newIsOpen = !isBottomPanelOpen;
        setBottomPanelOpen(newIsOpen);
        if (newIsOpen && window.innerWidth < 768) {
            setBottomPanelHeight(250);
        }
    };

    const handleMobilePanelResizeStart = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const startHeight = mobilePanelHeight;

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const deltaY = startY - moveEvent.clientY;
            // Limit height between 100px and 90% of screen height
            const newHeight = Math.max(
                100,
                Math.min(window.innerHeight * 0.9, startHeight + deltaY)
            );
            setMobilePanelHeight(newHeight);
        };

        const handlePointerUp = () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [forexMetrics, binanceMetrics, posData] = await Promise.all([
                    api.getForexMetrics(),
                    api.getBinanceMetrics(),
                    api.getPositions(),
                ]);

                const forexBalanceStr =
                    forexMetrics.find((m) => m.title.toLowerCase().includes('balance'))?.value ||
                    '0';
                setForexBalanceValue(parseFloat(forexBalanceStr.replace(/[^0-9.-]+/g, '')));

                const binanceBalanceStr =
                    binanceMetrics.find((m) => m.title.toLowerCase().includes('balance'))?.value ||
                    '0';
                setBinanceBalanceValue(parseFloat(binanceBalanceStr.replace(/[^0-9.-]+/g, '')));

                setPositions(posData);
            } catch (error) {
                console.error('Failed to load chart-related data:', error);
                setForexBalanceValue(0);
                setBinanceBalanceValue(0);
                setPositions([]);
            }
        };
        fetchData();
        const intervalId = setInterval(fetchData, 10000);
        return () => clearInterval(intervalId);
    }, []);

    // Sync strategy indicators
    useEffect(() => {
        if (!strategyVisibility) return;

        setAllActiveIndicators((currentIndicators) => {
            // 1. Identify persistent (manual) indicators vs strategy indicators
            // Fix: Recalculate data for manual indicators as well to support Timeframe switches
            const manualIndicators = currentIndicators
                .filter((ind) => !ind.id.startsWith('strategy_'))
                .map((ind) => {
                    // Skip Kuri indicators — their data is managed by the dedicated
                    // async Kuri recalculation effect (avoids overwriting plot data)
                    if (ind.type.startsWith('KURI_') || ind.kuriScript) {
                        return ind;
                    }
                    return {
                        ...ind,
                        data: calculateIndicatorData(ind, data),
                    };
                });

            // 2. Build list of desired strategy indicators
            const strategyIndicators: Indicator[] = [];

            customScripts.forEach((strategy) => {
                if (strategyVisibility[strategy.id]) {
                    strategy.indicators.forEach((config, index) => {
                        const indId = `strategy_${strategy.id}_${index}`;

                        // Check if already exists to preserve data/settings if possible (though settings are driven by strategy)
                        // Actually, strategy settings should be valid source of truth.
                        // But calculated data might need re-calc if not present.

                        // Map config to settings
                        const settings: IndicatorSettings = {
                            period: config.parameters.period,
                            stdDev: config.parameters.stdDev,
                            // generic map
                            ...config.parameters,
                        };

                        // Ensure color is set if missing
                        if (!settings.color) settings.color = '#FFFF00'; // Default yellow for strategies

                        // Calculate data
                        // Note: Data is usually calculated when added or update.
                        // We can use calculateIndicatorData helper.
                        // But we need the helper imported? Yes, explicitly.
                        // Wait, calculateIndicatorData is defined in this file (lines 93-109) or imported?
                        // It was defined in lines 93-109 in the file view I saw earlier!
                        // Ah, no, lines 93-109 in the file view calls IMPORTED helpers.
                        // Line 93: const calculateIndicatorData = ...

                        const tempIndicator: Indicator = {
                            id: indId,
                            type: config.type as IndicatorType,
                            settings: settings,
                            data: {}, // Calculated below
                            isVisible: true,
                        };

                        const calculatedData = calculateIndicatorData(tempIndicator, data);
                        tempIndicator.data = calculatedData;

                        strategyIndicators.push(tempIndicator);
                    });
                }
            });

            // 3. Merge: Manual + New Strategy Indicators
            // Note: This replaces all strategy indicators with fresh ones.
            // This is safer for consistency with the strategy definition, but might be heavy if data doesn't change.
            // However, this effect runs on [strategyVisibility, customScripts, data].
            // If data updates, we want re-calc anyway.

            return [...manualIndicators, ...strategyIndicators];
        });
    }, [strategyVisibility, customScripts, data]);

    // Keep header OHLC in sync with latest data when not hovering
    useEffect(() => {
        if (!tooltip.visible && data.length > 0) {
            setHeaderOhlc(data[data.length - 1]);
        }
    }, [data, tooltip.visible]);

    // Load indicators from database on mount or symbol/timeframe change
    // Load indicators from DB only on symbol/timeframe change (not on every tick)
    useEffect(() => {
        let cancelled = false;
        setIndicatorsLoaded(false);

        const loadIndicators = async () => {
            const dbIndicators = await indicatorService.fetchUserIndicators(
                props.symbol,
                props.activeTimeframe
            );
            if (cancelled) return;

            // Calculate data for loaded indicators
            // KURI_LINE indicators preserve existing data if available — they'll be
            // recalculated asynchronously by the Kuri recalculation effect below
            setAllActiveIndicators((prev) => {
                const prevMap = new Map<string, Indicator>();
                prev.forEach((p) => prevMap.set(p.id, p));

                const indicatorsWithData = dbIndicators.map((ind) => {
                    if (ind.type.startsWith('KURI_')) {
                        // Preserve existing KURI data to avoid blinking during reload
                        const existing = prevMap.get(ind.id);
                        const hasData = existing?.data && Object.keys(existing.data).length > 0;
                        return {
                            ...ind,
                            data: hasData ? existing!.data : {},
                            settings: hasData
                                ? { ...ind.settings, ...existing!.settings }
                                : ind.settings,
                        };
                    }
                    return {
                        ...ind,
                        data: calculateIndicatorData(ind, data),
                    };
                });

                const dbIds = new Set(indicatorsWithData.map((i) => i.id));
                // Keep locally-added indicators that aren't in the DB yet (optimistic adds)
                const localOnly = prev.filter((p) => !dbIds.has(p.id));
                return [...indicatorsWithData, ...localOnly];
            });
            setIndicatorsLoaded(true);
        };

        loadIndicators();

        return () => {
            cancelled = true;
        };
    }, [props.symbol, props.activeTimeframe]); // DB reload only on symbol/timeframe change

    // Recalculate built-in indicator data when new candles arrive
    useEffect(() => {
        if (!indicatorsLoaded || data.length === 0) return;
        setAllActiveIndicators((prev) =>
            prev.map((ind) => {
                if (ind.type.startsWith('KURI_')) return ind; // KURI handled by its own effect
                const newData = calculateIndicatorData(ind, data);
                // Skip update if data hasn't changed (same length)
                if (ind.data?.main?.length === newData?.main?.length) return ind;
                return { ...ind, data: newData };
            })
        );
    }, [data.length, indicatorsLoaded]); // Only when new candles arrive

    // Async recalculation for KURI_LINE indicators when data changes
    // (e.g., new candles arrive, symbol/timeframe switch)
    useEffect(() => {
        if (!indicatorsLoaded || data.length === 0) return;

        const kuriIndicators = allActiveIndicators.filter(
            (ind) => ind.type.startsWith('KURI_') && ind.kuriScript
        );
        if (kuriIndicators.length === 0) return;

        let cancelled = false;

        const recalculate = async () => {
            const context = {
                open: data.map((c) => c.open),
                high: data.map((c) => c.high),
                low: data.map((c) => c.low),
                close: data.map((c) => c.close),
                volume: data.map((c) => c.volume || 0),
                time: data.map((c) => c.time * 1000),
            };

            const securityFetcher = async (symbol: string, timeframe: string, limit: number) => {
                const candles = await getCandles(symbol, timeframe, limit);
                return candles.map((c) => ({
                    time: c.time * 1000,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume || 0,
                }));
            };

            // Group by kuriScript to avoid re-executing identical scripts
            const scriptGroups = new Map<string, Indicator[]>();
            for (const ind of kuriIndicators) {
                const key = ind.kuriScript!;
                if (!scriptGroups.has(key)) scriptGroups.set(key, []);
                scriptGroups.get(key)!.push(ind);
            }

            const updatedIndicators: Indicator[] = [];

            for (const [script, indicators] of scriptGroups) {
                try {
                    // Collect user input overrides from the first indicator in the group
                    const inputOverrides =
                        (indicators[0]?.settings as any)?.kuriInputs || undefined;

                    const result = await Kuri.executeWithVMAsync(script, context, {
                        securityFetcher,
                        inputOverrides,
                    });
                    if (cancelled) return;

                    const allPlots = (result.plots || []).filter(
                        (plot: { data: any }) =>
                            Array.isArray(plot.data) || (plot.data && typeof plot.data === 'object')
                    );

                    // Match each indicator to its corresponding plot(s)
                    for (const ind of indicators) {
                        // Grouped multi-series indicator (has seriesColors in settings)
                        const isGrouped = !!(ind.settings as any)?.seriesColors;
                        if (isGrouped) {
                            const seriesColors = (ind.settings as any)?.seriesColors as
                                | Record<string, string>
                                | undefined;
                            const overlayLinePlots = allPlots.filter((p: any) => {
                                const pt = (p as any).type || 'line';
                                return pt === 'line';
                            });
                            if (overlayLinePlots.length > 0) {
                                const groupedData: Record<string, (number | null)[]> = {};
                                const newSeriesColors: Record<string, string> = {};
                                overlayLinePlots.forEach((plot: any, idx: number) => {
                                    const key = plot.title || `line_${idx}`;
                                    groupedData[key] = Array.isArray(plot.data) ? plot.data : [];
                                    newSeriesColors[key] =
                                        plot.config?.color ||
                                        (seriesColors && seriesColors[key]) ||
                                        '#FF9800';
                                });
                                updatedIndicators.push({
                                    ...ind,
                                    data: groupedData,
                                    settings: {
                                        ...ind.settings,
                                        seriesColors: newSeriesColors,
                                    },
                                    kuriInputDefs: result.inputDefinitions || ind.kuriInputDefs,
                                });
                            } else {
                                updatedIndicators.push(ind);
                            }
                            continue;
                        }

                        // Match plot by title first, then fallback to index-based matching from ID
                        let plot = allPlots.find((p: any) => p.title === ind.kuriPlotTitle);

                        if (!plot) {
                            const plotIdxMatch = ind.id.match(/plot(\d+)/);
                            const plotIdx = plotIdxMatch ? parseInt(plotIdxMatch[1], 10) : 0;
                            plot = allPlots[plotIdx];
                        }

                        if (plot) {
                            const plotType = (plot as any).type || 'line';
                            // Build data based on plot type
                            let plotData: Record<string, (number | null)[]>;
                            if (plotType === 'band' && plot.data && !Array.isArray(plot.data)) {
                                plotData = {
                                    upper: (plot.data as any).upper || [],
                                    lower: (plot.data as any).lower || [],
                                    middle:
                                        (plot.data as any).middle || (plot.data as any).basis || [],
                                };
                            } else {
                                plotData = {
                                    main: Array.isArray(plot.data)
                                        ? (plot.data as (number | null)[])
                                        : [],
                                };
                            }

                            updatedIndicators.push({
                                ...ind,
                                data: plotData,
                                settings: {
                                    ...ind.settings,
                                    color:
                                        (plot as any).config?.color ||
                                        ind.settings.color ||
                                        '#FF9800',
                                },
                                kuriInputDefs: result.inputDefinitions || ind.kuriInputDefs,
                            });
                        } else {
                            updatedIndicators.push(ind);
                        }
                    }

                    // Update Kuri drawings too
                    const kuriDrawings = convertKuriDrawings(result.drawings, data);
                    const tables = getKuriTables(result.drawings);
                    if (tables.length > 0) setKuriTables(tables);
                    if (kuriDrawings.length > 0) {
                        setDrawings((prev) => [
                            ...prev.filter((d: Drawing) => !d.id.startsWith('kuri_')),
                            ...kuriDrawings,
                        ]);
                    }
                } catch (e) {
                    console.error('Failed to recalculate Kuri indicator:', e);
                    addConsoleLog(
                        'error',
                        'Kuri Recalc',
                        `Failed to recalculate indicator: ${e instanceof Error ? e.message : String(e)}`,
                        indicators.map((i) => i.kuriPlotTitle || i.type).join(', ')
                    );
                    // Clear stale data for failed indicators
                    updatedIndicators.push(...indicators.map((ind) => ({ ...ind, data: {} })));
                    if (onChartError) {
                        onChartError(
                            toChartErrorFromString(
                                `Indicator execution failed: ${e instanceof Error ? e.message : String(e)}`,
                                indicators.map((i) => i.type).join(', ') || 'Indicator'
                            )
                        );
                    }
                }
            }

            if (cancelled || updatedIndicators.length === 0) return;

            // Log recalculated data diagnostics
            updatedIndicators.forEach((ind) => {
                const dataKeys = Object.keys(ind.data);
                if (dataKeys.length === 0) {
                    addConsoleLog(
                        'warn',
                        'Kuri Recalc',
                        `"${ind.kuriPlotTitle || ind.type}" recalculated but data is empty — script may not have a matching plot.`
                    );
                    return;
                }
                const allNull = dataKeys.every((k) => {
                    const arr = (ind.data as any)[k];
                    return (
                        !Array.isArray(arr) ||
                        arr.length === 0 ||
                        arr.every((v: any) => v === null || v === undefined)
                    );
                });
                if (allNull) {
                    addConsoleLog(
                        'warn',
                        'Kuri Recalc',
                        `"${ind.kuriPlotTitle || ind.type}" recalculated but all ${dataKeys.length} series contain only null values — the formula may need more candles or has a logic issue.`,
                        `Series: [${dataKeys.join(', ')}], Candles: ${data.length}`
                    );
                } else {
                    const totalPoints = dataKeys.reduce((sum, k) => {
                        const arr = (ind.data as any)[k];
                        return (
                            sum +
                            (Array.isArray(arr)
                                ? arr.filter((v: any) => v !== null && v !== undefined).length
                                : 0)
                        );
                    }, 0);
                    addConsoleLog(
                        'info',
                        'Kuri Recalc',
                        `"${ind.kuriPlotTitle || ind.type}" recalculated — ${totalPoints} valid data points across ${dataKeys.length} series`
                    );
                }
            });

            setAllActiveIndicators((prev) => {
                const updatedMap = new Map<string, Indicator>();
                updatedIndicators.forEach((u) => updatedMap.set(u.id, u));

                return prev.map((ind) => updatedMap.get(ind.id) || ind);
            });
        };

        // Debounce recalculation to avoid excessive re-execution on rapid data updates
        const timeoutId = setTimeout(recalculate, 300);
        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [data.length, indicatorsLoaded]); // Trigger on new candles, not every tick update

    // Debounce indicator saves to database
    useEffect(() => {
        if (!indicatorsLoaded) return; // Don't save during initial load

        const timeoutId = setTimeout(async () => {
            // Filter out strategy indicators (they're managed by strategy visibility)
            const manualIndicators = allActiveIndicators.filter(
                (ind) => !ind.id.startsWith('strategy_')
            );

            // Note: This is a simplified approach - ideally track individual changes
            // For now, we rely on handlers below to save individual changes
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [allActiveIndicators, indicatorsLoaded, data]);

    // Overlay indicators render on main chart (price-based)
    // Panel indicators render in separate panels (oscillators, volume, etc.)
    // Shared overlay type list — single source of truth
    const OVERLAY_TYPES = useMemo(
        () => [
            // Moving Averages (original + new)
            'MA',
            'SMA',
            'EMA',
            'WMA',
            'VWMA',
            'HMA',
            'MA Ribbon',
            'DEMA',
            'TEMA',
            'ALMA',
            'KAMA',
            'SMMA',
            'ZLEMA',
            'RMA',
            'SWMA',
            'LINREG',
            // Volatility / Channels
            'BB',
            'Bollinger Bands',
            'BOLLINGER_BANDS',
            'SuperTrend',
            'DONCHIAN',
            'DC',
            'Donchian Channels',
            'ICHIMOKU',
            'Ichimoku',
            'Ichimoku Cloud',
            'KELTNER',
            'KC',
            'Keltner Channels',
            // Price overlays
            'VWAP',
            'SAR',
            'ADR',
            // Custom Kuri scripts (overlay types)
            'KURI_LINE',
            'KURI_AREA',
            'KURI_BAND',
            'KURI_HISTOGRAM',
            'KURI_COLUMNS',
            'KURI_MARKERS',
        ],
        []
    );

    const overlayIndicators = useMemo(() => {
        return allActiveIndicators.filter((i) => {
            // Kuri indicators: use the kuriOverlay flag if set
            if (i.kuriOverlay !== undefined) return i.kuriOverlay;
            return OVERLAY_TYPES.includes(i.type);
        });
    }, [allActiveIndicators, OVERLAY_TYPES]);

    const panelIndicators = useMemo(() => {
        return allActiveIndicators.filter((i) => {
            if (i.kuriOverlay !== undefined) return !i.kuriOverlay;
            return !OVERLAY_TYPES.includes(i.type);
        });
    }, [allActiveIndicators, OVERLAY_TYPES]);

    // Diagnose indicator data issues (runs once per indicator change, not on every render)
    useEffect(() => {
        allActiveIndicators.forEach((ind) => {
            if (!ind.isVisible) return;
            const warnKey = `${ind.id}_${Object.keys(ind.data).length}`;
            if (loggedIndicatorWarnings.current.has(warnKey)) return;

            const dataKeys = Object.keys(ind.data);
            if (dataKeys.length === 0) {
                // Skip empty-data warning for Kuri types — they always load with data: {} from DB
                // and will be recalculated by the Kuri recalc effect which has its own diagnostics
                if (ind.type.startsWith('KURI_') && ind.kuriScript) return;
                loggedIndicatorWarnings.current.add(warnKey);
                addConsoleLog(
                    'warn',
                    'Diagnostics',
                    `"${ind.kuriPlotTitle || ind.type}" has empty data object — no series to plot.`,
                    `ID: ${ind.id}, Type: ${ind.type}`
                );
                return;
            }

            const allNull = dataKeys.every((k) => {
                const arr = (ind.data as any)[k];
                return !Array.isArray(arr) || arr.every((v: any) => v === null || v === undefined);
            });
            if (allNull) {
                loggedIndicatorWarnings.current.add(warnKey);
                addConsoleLog(
                    'warn',
                    'Diagnostics',
                    `"${ind.kuriPlotTitle || ind.type}" has data keys [${dataKeys.join(', ')}] but all values are null — line will not be visible.`,
                    `This usually means: not enough candles loaded for the indicator period, or the formula returned null for all bars.`
                );
            }
        });
    }, [allActiveIndicators, addConsoleLog]);

    const assetType: 'Forex' | 'Binance' = useMemo(() => {
        const upperSymbol = props.symbol.toUpperCase();
        if (
            upperSymbol.includes('USDT') ||
            upperSymbol.includes('BTC') ||
            upperSymbol.includes('ETH')
        ) {
            return 'Binance';
        }
        return 'Forex';
    }, [props.symbol]);

    const openPositions = useMemo(() => {
        const normalizedSymbol = props.symbol.replace('/', '').toUpperCase();
        return positions.filter(
            (p) =>
                p.status === PositionStatus.OPEN &&
                p.symbol.replace('/', '').toUpperCase() === normalizedSymbol
        );
    }, [props.symbol, positions]);

    const MIN_PANEL_WIDTH = 240;
    const MAX_PANEL_WIDTH = 640;

    const handleResizePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = rightPanelWidth;

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const newWidth = startWidth - dx;

            setRightPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(newWidth, MAX_PANEL_WIDTH)));
        };

        const handlePointerUp = () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
    };

    // Load Chart Type from local storage
    useEffect(() => {
        const savedType = localStorage.getItem('chart_type_preference');
        if (savedType === 'Candle' || savedType === 'Line') {
            setChartType(savedType);
        }
    }, []);

    // Helper to commit current state to Undo Stack
    const commitCurrentState = () => {
        const currentState: HistoryState = {
            drawings: JSON.parse(JSON.stringify(drawings)), // Deep copy to prevent ref issues
            indicators: JSON.parse(JSON.stringify(allActiveIndicators)),
            view: { ...view },
            priceRange: priceRange ? { ...priceRange } : null,
            isAutoScaling,
            chartType,
        };
        setUndoStack((prev) => [...prev.slice(-49), currentState]); // Limit to 50
        setRedoStack([]);
    };

    // Replace the old commitStateAndApplyChanges with a wrapper if needed,
    // but better to just use commitCurrentState() before changes.
    // For compatibility with existing drawing logic, we can keep a wrapper but update it.
    const commitStateAndApplyChanges = (updater: (prevState: HistoryState) => HistoryState) => {
        // This was used for atomic updates.
        // New strategy: Commit CURRENT state, then apply updates normally via setters.
        commitCurrentState();

        // Note: The updater pattern in previous code was a bit weird because it tried to return a full new state.
        // We will migrate away from this where possible, but for now let's support it by applying the diff.
        const currentState: HistoryState = {
            drawings,
            indicators: allActiveIndicators,
            view,
            priceRange,
            isAutoScaling,
            chartType,
        };
        const newState = updater(currentState);

        setDrawings(newState.drawings);
        setAllActiveIndicators(newState.indicators);
        setView(newState.view);
        setPriceRange(newState.priceRange);
        setIsAutoScaling(newState.isAutoScaling);
        setChartType(newState.chartType);
    };

    const handleUndo = () => {
        if (undoStack.length === 0) return;
        const currentState: HistoryState = {
            drawings: JSON.parse(JSON.stringify(drawings)),
            indicators: JSON.parse(JSON.stringify(allActiveIndicators)),
            view: { ...view },
            priceRange: priceRange ? { ...priceRange } : null,
            isAutoScaling,
            chartType,
        };
        const previousState = undoStack[undoStack.length - 1];

        setRedoStack((prev) => [currentState, ...prev]);
        setUndoStack((prev) => prev.slice(0, -1));

        setDrawings(previousState.drawings);
        setAllActiveIndicators(previousState.indicators);
        setView(previousState.view);
        setPriceRange(previousState.priceRange);
        setIsAutoScaling(previousState.isAutoScaling);
        setChartType(previousState.chartType);
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const currentState: HistoryState = {
            drawings: JSON.parse(JSON.stringify(drawings)),
            indicators: JSON.parse(JSON.stringify(allActiveIndicators)),
            view: { ...view },
            priceRange: priceRange ? { ...priceRange } : null,
            isAutoScaling,
            chartType,
        };
        const nextState = redoStack[0];

        setUndoStack((prev) => [...prev, currentState]);
        setRedoStack((prev) => prev.slice(1));

        setDrawings(nextState.drawings);
        setAllActiveIndicators(nextState.indicators);
        setView(nextState.view);
        setPriceRange(nextState.priceRange);
        setIsAutoScaling(nextState.isAutoScaling);
        setChartType(nextState.chartType);
    };

    const commitDrawingChange = (updater: (prev: Drawing[]) => Drawing[]) => {
        commitStateAndApplyChanges((prevState) => ({
            ...prevState,
            drawings: updater(prevState.drawings),
        }));
    };

    const handleDeleteDrawing = (id: string) => {
        // Remove associated alerts
        const associatedAlerts = alerts.filter((a) => a.drawingId === id);
        associatedAlerts.forEach((alert) => {
            priceAlertService.deleteAlert(alert.id);
        });
        setAlerts((prev) => prev.filter((a) => a.drawingId !== id));

        commitDrawingChange((prev) => prev.filter((d) => d.id !== id));
        if (selectedDrawingId === id) setSelectedDrawingId(null);
    };

    const handleCloneDrawing = (id: string) => {
        const drawing = drawings.find((d) => d.id === id);
        if (!drawing) return;
        const shiftPoint = (p: Point) => ({
            time: p.time + (candleInterval || 3600),
            price: p.price,
        });
        const newDrawing = { ...drawing, id: `d${Date.now()}` };

        if (newDrawing.type === 'Horizontal Line') {
            (newDrawing as HorizontalLineDrawing).price *= 1.001;
        } else if (newDrawing.type === 'Vertical Line') {
            (newDrawing as VerticalLineDrawing).time += candleInterval || 3600;
        } else if (newDrawing.type === 'Text Note') {
            (newDrawing as TextNoteDrawing).point = shiftPoint(
                (newDrawing as TextNoteDrawing).point
            );
        } else {
            if ('start' in newDrawing)
                (newDrawing as any).start = shiftPoint((newDrawing as any).start);
            if ('end' in newDrawing) (newDrawing as any).end = shiftPoint((newDrawing as any).end);
            // Fix: added explicit type assertion for points array to resolve TS error
            if ('points' in newDrawing)
                (newDrawing as any).points = ((newDrawing as any).points as any[]).map(shiftPoint);
        }
        commitDrawingChange((prev) => [...prev, newDrawing as Drawing]);
    };

    const handleUpdateDrawing = (newDrawing: Drawing) => {
        commitDrawingChange((prev) => prev.map((d) => (d.id === newDrawing.id ? newDrawing : d)));
    };

    const handleToggleDrawingVisibility = (id: string) => {
        commitDrawingChange((prev) =>
            prev.map((d) => (d.id === id ? { ...d, isVisible: !(d.isVisible ?? true) } : d))
        );
    };

    const handleAddIndicator = async (type: IndicatorType) => {
        commitCurrentState(); // Save state before adding indicator
        const newIndicator: Indicator = {
            id: `ind${Date.now()}`,
            type,
            settings: getIndicatorDefaults(type),
            data: {},
            isVisible: true,
        };
        newIndicator.data = calculateIndicatorData(newIndicator, data);

        // Log indicator diagnostics
        const dataKeys = Object.keys(newIndicator.data);
        const hasData = dataKeys.some((k) => {
            const arr = (newIndicator.data as any)[k];
            return Array.isArray(arr) && arr.some((v: any) => v !== null && v !== undefined);
        });
        if (hasData) {
            addConsoleLog(
                'info',
                'Indicator',
                `Added "${type}" — ${dataKeys.length} series, ${data.length} candles`
            );
        } else {
            addConsoleLog(
                'warn',
                'Indicator',
                `"${type}" produced no plot data. Check settings or ensure enough candles are loaded.`,
                `Settings: ${JSON.stringify(newIndicator.settings)}`
            );
        }

        // Feed to AlertEngine for indicator alerts
        feedIndicatorToAlertEngine(newIndicator);

        // Optimistic update
        commitStateAndApplyChanges((prev) => ({
            ...prev,
            indicators: [...prev.indicators, newIndicator],
        }));

        // Save to database (don't block UI)
        const saved = await indicatorService.saveIndicator(
            props.symbol,
            props.activeTimeframe,
            newIndicator
        );
        if (saved) {
            // Update with DB-generated ID using functional updater
            // to avoid stale closure after async await
            setAllActiveIndicators((prev) =>
                prev.map((i) => (i.id === newIndicator.id ? { ...i, id: saved.id } : i))
            );
        }
    };

    const handleAddCustomIndicator = useCallback(
        async (script: Strategy) => {
            // Handle Kuri scripts — execute and extract plot series
            if (script.kuriScript) {
                try {
                    const context = {
                        open: data.map((c) => c.open),
                        high: data.map((c) => c.high),
                        low: data.map((c) => c.low),
                        close: data.map((c) => c.close),
                        volume: data.map((c) => c.volume || 0),
                        time: data.map((c) => c.time * 1000), // Kuri expects ms
                    };

                    // Security fetcher for request.security() cross-symbol support
                    const securityFetcher = async (
                        symbol: string,
                        timeframe: string,
                        limit: number
                    ) => {
                        const candles = await getCandles(symbol, timeframe, limit);
                        return candles.map((c) => ({
                            time: c.time * 1000,
                            open: c.open,
                            high: c.high,
                            low: c.low,
                            close: c.close,
                            volume: c.volume || 0,
                        }));
                    };

                    const result = await Kuri.executeWithVMAsync(script.kuriScript, context, {
                        securityFetcher,
                    });
                    const plots = result.plots || [];
                    const inputDefs = result.inputDefinitions || [];

                    // Log Kuri execution diagnostics
                    if (plots.length === 0) {
                        addConsoleLog(
                            'warn',
                            'Kuri Script',
                            `Script "${script.name}" executed successfully but produced 0 plots — nothing to display.`,
                            'Make sure the script uses plot() or similar functions to output data.'
                        );
                    } else {
                        plots.forEach((plot: any, idx: number) => {
                            const plotData = plot.data;
                            const plotTitle = plot.title || `plot_${idx}`;
                            if (!plotData) {
                                addConsoleLog(
                                    'warn',
                                    'Kuri Script',
                                    `Plot "${plotTitle}" in "${script.name}" has no data property.`
                                );
                            } else if (Array.isArray(plotData)) {
                                const nonNullCount = plotData.filter(
                                    (v: any) => v !== null && v !== undefined
                                ).length;
                                if (nonNullCount === 0) {
                                    addConsoleLog(
                                        'warn',
                                        'Kuri Script',
                                        `Plot "${plotTitle}" in "${script.name}" has ${plotData.length} values but all are null — line will be invisible.`,
                                        'Check that the indicator formula produces valid numbers for the given candle data.'
                                    );
                                } else {
                                    addConsoleLog(
                                        'info',
                                        'Kuri Script',
                                        `Plot "${plotTitle}": ${nonNullCount}/${plotData.length} valid data points, type="${plot.type || 'line'}"`
                                    );
                                }
                            } else if (typeof plotData === 'object') {
                                const keys = Object.keys(plotData);
                                addConsoleLog(
                                    'info',
                                    'Kuri Script',
                                    `Plot "${plotTitle}": band/multi with keys [${keys.join(', ')}], type="${plot.type || 'line'}"`
                                );
                            }
                        });
                    }

                    // Extract and convert Kuri drawings (labels, lines, boxes)
                    const kuriDrawings = convertKuriDrawings(result.drawings, data);
                    // Extract Kuri tables for HTML overlay
                    const tables = getKuriTables(result.drawings);
                    if (tables.length > 0) setKuriTables(tables);

                    // Determine overlay from script declaration (parse from script text)
                    const overlayMatch = script.kuriScript?.match(/overlay\s*=\s*(true|false)/);
                    const scriptIsOverlay = overlayMatch ? overlayMatch[1] === 'true' : true;

                    // Map Kuri plot types to chart indicator types
                    const mapPlotType = (plotType: string): IndicatorType => {
                        switch (plotType) {
                            case 'histogram':
                            case 'columns':
                                return 'KURI_HISTOGRAM';
                            case 'area':
                                return 'KURI_AREA';
                            case 'band':
                                return 'KURI_BAND';
                            case 'markers':
                            case 'marker':
                            case 'shapes':
                                return 'KURI_MARKERS';
                            default:
                                return 'KURI_LINE';
                        }
                    };

                    // Determine if a plot type should be in a separate panel
                    const isOverlayPlot = (plotType: string): boolean => {
                        if (!scriptIsOverlay) return false; // indicator(overlay=false) → all panels
                        // Histograms/columns naturally go to panels
                        if (plotType === 'histogram' || plotType === 'columns') return false;
                        return true;
                    };

                    // Group overlay line plots from the same script into a single multi-series indicator
                    const validPlots = plots.filter(
                        (plot: any) =>
                            Array.isArray(plot.data) || (plot.data && typeof plot.data === 'object')
                    );
                    const overlayLinePlots = validPlots.filter((plot: any) => {
                        const pt = plot.type || 'line';
                        return pt === 'line' && isOverlayPlot(pt);
                    });
                    const otherPlots = validPlots.filter((plot: any) => {
                        const pt = plot.type || 'line';
                        return !(pt === 'line' && isOverlayPlot(pt));
                    });

                    const kuriIndicators: Indicator[] = [];

                    // Create a single grouped indicator for all overlay line plots
                    if (overlayLinePlots.length > 0) {
                        const groupedData: Record<string, (number | null)[]> = {};
                        const seriesColors: Record<string, string> = {};
                        overlayLinePlots.forEach((plot: any, idx: number) => {
                            const key = plot.title || `line_${idx}`;
                            groupedData[key] = Array.isArray(plot.data) ? plot.data : [];
                            seriesColors[key] = plot.config?.color || '#FF9800';
                        });
                        // Use first plot's color as the primary indicator color
                        const primaryColor = overlayLinePlots[0]?.config?.color || '#FF9800';
                        kuriIndicators.push({
                            id: `kuri_${script.id}_grouped_${Date.now()}`,
                            type: 'KURI_LINE' as IndicatorType,
                            settings: {
                                color: primaryColor,
                                period: 1,
                                seriesColors,
                                ...(overlayLinePlots[0]?.config?.lineWidth && {
                                    lineWidth: overlayLinePlots[0].config.lineWidth,
                                }),
                            },
                            data: groupedData,
                            isVisible: true,
                            kuriScript: script.kuriScript,
                            kuriPlotType: 'line',
                            kuriOverlay: true,
                            kuriInputDefs: inputDefs.map((d: any) => ({
                                id: d.id,
                                type: d.type,
                                title: d.title,
                                defval: d.defval,
                                minval: d.minval,
                                maxval: d.maxval,
                                step: d.step,
                                options: d.options,
                                tooltip: d.tooltip,
                                group: d.group,
                            })),
                            kuriPlotTitle: script.name || overlayLinePlots[0]?.title || 'Kuri',
                        });
                    }

                    // Create individual indicators for non-line / non-overlay plots
                    otherPlots.forEach((plot: any, idx: number) => {
                        const plotType = plot.type || 'line';
                        const chartType = mapPlotType(plotType);

                        let plotData: Record<string, (number | null)[]>;
                        if (plotType === 'band' && plot.data && !Array.isArray(plot.data)) {
                            plotData = {
                                upper: plot.data.upper || [],
                                lower: plot.data.lower || [],
                                middle: plot.data.middle || plot.data.basis || [],
                            };
                        } else {
                            plotData = { main: Array.isArray(plot.data) ? plot.data : [] };
                        }

                        kuriIndicators.push({
                            id: `kuri_${script.id}_plot${idx}_${Date.now()}`,
                            type: chartType,
                            settings: {
                                color: plot.config?.color || '#FF9800',
                                period: 1,
                                ...(plot.config?.fillColor && { fillColor: plot.config.fillColor }),
                                ...(plot.config?.positiveColor && {
                                    histogramUpColor: plot.config.positiveColor,
                                }),
                                ...(plot.config?.negativeColor && {
                                    histogramDownColor: plot.config.negativeColor,
                                }),
                                ...(plot.config?.upperColor && {
                                    upperColor: plot.config.upperColor,
                                }),
                                ...(plot.config?.lowerColor && {
                                    lowerColor: plot.config.lowerColor,
                                }),
                                ...(plot.config?.lineWidth && { lineWidth: plot.config.lineWidth }),
                            },
                            data: plotData,
                            isVisible: true,
                            kuriScript: script.kuriScript,
                            kuriPlotType: plotType,
                            kuriOverlay: isOverlayPlot(plotType),
                            kuriInputDefs: inputDefs.map((d: any) => ({
                                id: d.id,
                                type: d.type,
                                title: d.title,
                                defval: d.defval,
                                minval: d.minval,
                                maxval: d.maxval,
                                step: d.step,
                                options: d.options,
                                tooltip: d.tooltip,
                                group: d.group,
                            })),
                            kuriPlotTitle: plot.title || script.name,
                        });
                    });

                    if (kuriIndicators.length > 0 || kuriDrawings.length > 0) {
                        addConsoleLog(
                            'info',
                            'Kuri Script',
                            `Executed "${script.name}" — ${kuriIndicators.length} plot(s), ${kuriDrawings.length} drawing(s)`
                        );
                        kuriIndicators.forEach((ind) => {
                            const dataKeys = Object.keys(ind.data);
                            const hasData = dataKeys.some((k) => {
                                const arr = (ind.data as any)[k];
                                return (
                                    Array.isArray(arr) &&
                                    arr.some((v: any) => v !== null && v !== undefined)
                                );
                            });
                            if (!hasData) {
                                addConsoleLog(
                                    'warn',
                                    'Kuri Script',
                                    `Plot "${ind.kuriPlotTitle || ind.type}" has no data points — line will not be visible`,
                                    `Type: ${ind.kuriPlotType || ind.type}`
                                );
                            }
                        });
                        kuriIndicators.forEach(feedIndicatorToAlertEngine);
                        commitStateAndApplyChanges((prev) => ({
                            ...prev,
                            indicators: [...prev.indicators, ...kuriIndicators],
                            // Merge Kuri drawings: remove old kuri drawings, add new ones
                            drawings: [
                                ...prev.drawings.filter((d: Drawing) => !d.id.startsWith('kuri_')),
                                ...kuriDrawings,
                            ],
                        }));

                        // Persist each Kuri indicator to database (don't block UI)
                        kuriIndicators.forEach(async (ind) => {
                            const saved = await indicatorService.saveIndicator(
                                props.symbol,
                                props.activeTimeframe,
                                ind
                            );
                            if (saved) {
                                // Update with DB-generated ID
                                setAllActiveIndicators((prev) =>
                                    prev.map((i) => (i.id === ind.id ? { ...i, id: saved.id } : i))
                                );
                            }
                        });
                    }
                } catch (e) {
                    console.error('Failed to execute Kuri indicator script:', e);
                    addConsoleLog(
                        'error',
                        'Kuri Script',
                        `Failed to execute script "${script.name}": ${e instanceof Error ? e.message : String(e)}`
                    );
                }
                return;
            }

            // Handle traditional JSON indicator configs
            if (!script.indicators || script.indicators.length === 0) return;
            const newIndicators: Indicator[] = script.indicators.map((indData: any) => {
                const type = indData.type as IndicatorType;
                const settings = { ...getDefaultIndicatorSettings(type), ...indData.parameters };
                const newInd: Indicator = {
                    id: `ind${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    type,
                    settings,
                    data: {},
                    isVisible: true,
                };
                return newInd;
            });

            newIndicators.forEach(feedIndicatorToAlertEngine);
            commitStateAndApplyChanges((prev) => ({
                ...prev,
                indicators: [...prev.indicators, ...newIndicators],
            }));

            newIndicators.forEach((ind) =>
                indicatorService.saveIndicator(props.symbol, props.activeTimeframe, ind)
            );
        },
        [
            data,
            props.symbol,
            props.activeTimeframe,
            setKuriTables,
            commitStateAndApplyChanges,
            indicatorService,
        ]
    );

    // Auto-add script from Strategy Studio when navigated with ?addScript=<id>
    // Waits until customScripts are loaded from DB and chart data is available
    useEffect(() => {
        if (!autoAddScriptId || customScripts.length === 0 || data.length === 0) return;
        const script = customScripts.find((s) => s.id === autoAddScriptId);
        if (script) {
            console.log('[Chart] Auto-adding script from Strategy Studio:', script.name);
            handleAddCustomIndicator(script);
            onAutoAddComplete?.();
        }
        // Don't clear if script not found yet — customScripts may still be loading
    }, [autoAddScriptId, customScripts, data, handleAddCustomIndicator, onAutoAddComplete]);

    const handleCreateIndicatorAlert = (indicator: Indicator) => {
        setAlertModalInfo({
            visible: true,
            drawing: { type: 'Horizontal Line', price: 0 } as Drawing, // Dummy drawing to satisfy types if needed, or update Modal types
            indicatorId: indicator.id,
            indicatorType: indicator.type,
        });
    };

    const handleRemoveIndicator = async (id: string) => {
        commitCurrentState(); // Save state before removing indicator
        // Optimistic update
        const indicatorToRemove = allActiveIndicators.find((i) => i.id === id);
        commitStateAndApplyChanges((prev) => ({
            ...prev,
            indicators: prev.indicators.filter((i) => i.id !== id),
        }));

        // Delete from database (don't block UI)
        // Delete from database (don't block UI)
        if (indicatorToRemove && !id.startsWith('ind')) {
            // Only delete if it has a database ID (not temp ID)
            await indicatorService.deleteIndicator(id);
        }
    };

    const handleToggleIndicatorVisibility = async (id: string) => {
        // Optimistic update
        commitStateAndApplyChanges((prev) => ({
            ...prev,
            indicators: prev.indicators.map((i) =>
                i.id === id ? { ...i, isVisible: !i.isVisible } : i
            ),
        }));

        // Save to database (don't block UI)
        // Save to database (don't block UI)
        if (!id.startsWith('ind') && !id.startsWith('strategy_')) {
            const indicator = allActiveIndicators.find((i) => i.id === id);
            if (indicator) {
                await indicatorService.toggleIndicatorVisibility(id, !indicator.isVisible);
            }
        }
    };

    const handleToggleAllIndicatorsVisibility = (isVisible: boolean) => {
        commitStateAndApplyChanges((prev) => ({
            ...prev,
            indicators: prev.indicators.map((i) => ({ ...i, isVisible })),
        }));
    };

    const handleUpdateIndicator = async (id: string, newSettings: IndicatorSettings) => {
        // Optimistic update
        commitStateAndApplyChanges((prev) => {
            const indicators = prev.indicators.map((i) => {
                if (i.id === id) {
                    const updated = { ...i, settings: newSettings };

                    // Re-execute Kuri script when inputs change
                    if (
                        updated.type.startsWith('KURI_') &&
                        updated.kuriScript &&
                        'kuriInputs' in newSettings
                    ) {
                        try {
                            const ctx = {
                                open: data.map((c) => c.open),
                                high: data.map((c) => c.high),
                                low: data.map((c) => c.low),
                                close: data.map((c) => c.close),
                                volume: data.map((c) => c.volume || 0),
                                time: data.map((c) => c.time * 1000),
                            };
                            const result = Kuri.executeWithVM(updated.kuriScript, ctx, {
                                inputOverrides: newSettings.kuriInputs || undefined,
                            });
                            const plots = (result.plots || []).filter(
                                (p: any) =>
                                    Array.isArray(p.data) || (p.data && typeof p.data === 'object')
                            );

                            // Check if this is a grouped multi-series indicator
                            const isGrouped = !!(updated.settings as any)?.seriesColors;
                            if (isGrouped) {
                                // Rebuild grouped data structure from all line plots
                                const linePlots = plots.filter(
                                    (p: any) => (p.type || 'line') === 'line'
                                );
                                if (linePlots.length > 0) {
                                    const groupedData: Record<string, (number | null)[]> = {};
                                    const newSeriesColors: Record<string, string> = {};
                                    const oldSeriesColors =
                                        (updated.settings as any)?.seriesColors || {};
                                    linePlots.forEach((plot: any, idx: number) => {
                                        const key = plot.title || `line_${idx}`;
                                        groupedData[key] = Array.isArray(plot.data)
                                            ? plot.data
                                            : [];
                                        newSeriesColors[key] =
                                            plot.config?.color || oldSeriesColors[key] || '#FF9800';
                                    });
                                    updated.data = groupedData;
                                    updated.settings = {
                                        ...updated.settings,
                                        seriesColors: newSeriesColors,
                                    };
                                }
                            } else {
                                // Single-series: match by title or index
                                let plot = plots.find(
                                    (p: any) => p.title === updated.kuriPlotTitle
                                );
                                if (!plot) {
                                    const plotIdxMatch = updated.id.match(/plot(\d+)/);
                                    const plotIdx = plotIdxMatch
                                        ? parseInt(plotIdxMatch[1], 10)
                                        : 0;
                                    plot =
                                        plots[plotIdx] ||
                                        plots.find((p: any) => Array.isArray(p.data));
                                }
                                if (plot) {
                                    const plotType = (plot as any).type || 'line';
                                    if (
                                        plotType === 'band' &&
                                        plot.data &&
                                        !Array.isArray(plot.data)
                                    ) {
                                        updated.data = {
                                            upper: (plot.data as any).upper || [],
                                            lower: (plot.data as any).lower || [],
                                            middle:
                                                (plot.data as any).middle ||
                                                (plot.data as any).basis ||
                                                [],
                                        };
                                    } else {
                                        updated.data = {
                                            main: Array.isArray(plot.data)
                                                ? (plot.data as (number | null)[])
                                                : [],
                                        };
                                    }
                                }
                            }
                            // Update input definitions in case script structure changed
                            updated.kuriInputDefs =
                                result.inputDefinitions || updated.kuriInputDefs;

                            addConsoleLog(
                                'info',
                                'Kuri Update',
                                `Re-executed "${updated.kuriPlotTitle || updated.type}" with updated inputs — ${Object.keys(updated.data).length} series`
                            );
                        } catch (e) {
                            console.error('Failed to re-execute Kuri script:', e);
                            addConsoleLog(
                                'error',
                                'Kuri Update',
                                `Failed to re-execute script for "${updated.kuriPlotTitle || updated.type}": ${e instanceof Error ? e.message : String(e)}`
                            );
                        }
                    } else if (!updated.type.startsWith('KURI_')) {
                        updated.data = calculateIndicatorData(updated, data);
                    }
                    return updated;
                }
                return i;
            });
            return { ...prev, indicators };
        });

        // Save to database (don't block UI)
        if (!id.startsWith('ind')) {
            await indicatorService.updateIndicator(id, { settings: newSettings });
        }
    };

    const handleRemoveAllDrawings = () => commitDrawingChange(() => []);
    const handleRemoveAllIndicators = () =>
        commitStateAndApplyChanges((prev) => ({ ...prev, indicators: [] }));

    const getChartTemplates = () => {
        try {
            return JSON.parse(localStorage.getItem('chartTemplates') || '{}');
        } catch {
            return {};
        }
    };
    const handleSaveTemplate = () => {
        const name = prompt('Enter template name:');
        if (!name) return;
        const templates = getChartTemplates();
        templates[name] = { drawings, indicators: allActiveIndicators };
        localStorage.setItem('chartTemplates', JSON.stringify(templates));
        alert('Template saved.');
    };
    const handleLoadTemplate = (name: string) => {
        const templates = getChartTemplates();
        if (templates[name]) {
            const { drawings: loadedDrawings, indicators: loadedIndicators } = templates[name];
            const indicatorsWithData = (loadedIndicators as any[]).map((ind: Indicator) => ({
                ...ind,
                data: calculateIndicatorData(ind, data),
            }));
            commitStateAndApplyChanges((prev) => ({
                ...prev,
                drawings: loadedDrawings,
                indicators: indicatorsWithData,
            }));
            setIsTemplateManagerOpen(false);
        }
    };
    const handleDeleteTemplate = (name: string) => {
        const templates = getChartTemplates();
        delete templates[name];
        localStorage.setItem('chartTemplates', JSON.stringify(templates));
    };

    const getClampedViewState = (newStartIndex: number, newVisibleCandles: number): ViewState => {
        if (data.length === 0) {
            return { startIndex: 0, visibleCandles: Math.max(MIN_CANDLES, newVisibleCandles) };
        }

        const maxVisible = Math.max(data.length * 3, 500);
        const clampedVisibleCandles = Math.min(
            maxVisible,
            Math.max(MIN_CANDLES, newVisibleCandles)
        );

        const rightPadding = Math.max(RIGHT_SIDE_PADDING_CANDLES, clampedVisibleCandles / 5);

        const effectiveMin = -rightPadding;
        const effectiveMax = data.length - 1;

        const clampedStartIndex = Math.max(effectiveMin, Math.min(effectiveMax, newStartIndex));

        return { startIndex: clampedStartIndex, visibleCandles: clampedVisibleCandles };
    };

    const handleSaveSettings = (newSettings: ChartSettings) => {
        setChartSettings(newSettings);
        try {
            localStorage.setItem(`chartSettings_${props.symbol}`, JSON.stringify(newSettings));
        } catch (error) {
            console.error('Failed to save chart settings:', error);
        }
        setSettingsModalOpen(false);
    };
    const resetView = () => {
        commitCurrentState();
        const newVisibleCandles = 60;
        const newStartIndex = Math.max(
            0,
            data.length - newVisibleCandles + RIGHT_SIDE_PADDING_CANDLES
        );
        setView({ startIndex: newStartIndex, visibleCandles: newVisibleCandles });
        setIsAutoScaling(true);
    };
    const saveLayout = () => {
        try {
            const layout = { drawings, activeIndicators: allActiveIndicators };
            localStorage.setItem(`chartLayout_${props.symbol}`, JSON.stringify(layout));
            alert('Layout saved!');
        } catch (error) {
            console.error('Failed to save layout:', error);
            alert('Failed to save layout.');
        }
    };

    const coercePoint = (p: any): Point => ({
        time: typeof p?.time === 'number' ? p.time : 0,
        price: typeof p?.price === 'number' ? p.price : 0,
    });

    useEffect(() => {
        const initialVisibleCandles = 60;
        const initialStartIndex = Math.max(
            0,
            data.length - initialVisibleCandles + RIGHT_SIDE_PADDING_CANDLES
        );
        setView({ startIndex: initialStartIndex, visibleCandles: initialVisibleCandles });
        setIsAutoScaling(true);
        setUndoStack([]);
        setRedoStack([]);
        setSelectedDrawingId(null);
        setCurrentDrawing(null);
        // Indicators are loaded per-symbol by the loadIndicators effect above.
        // Do NOT clear them here — the load effect replaces state atomically.
    }, [props.symbol]); // Removed 'data' dependency to prevent reset on price update

    useEffect(() => {
        const chartContainer = chartContainerRef.current;
        const yAxisContainer = yAxisContainerRef.current;
        const xAxisContainer = xAxisContainerRef.current;
        if (!chartContainer || !yAxisContainer || !xAxisContainer) return;
        const chartObserver = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setChartDimensions({ width, height });
            }
        });
        const yAxisObserver = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setYAxisDimensions({ width, height });
            }
        });
        const xAxisObserver = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setXAxisDimensions({ width, height });
            }
        });
        chartObserver.observe(chartContainer);
        yAxisObserver.observe(yAxisContainer);
        xAxisObserver.observe(xAxisContainer);
        return () => {
            chartObserver.disconnect();
            yAxisObserver.disconnect();
            xAxisObserver.disconnect();
        };
    }, []);

    const xStep = useMemo(
        () =>
            chartDimensions.width > 0 && view.visibleCandles > 0
                ? chartDimensions.width / view.visibleCandles
                : 0,
        [chartDimensions.width, view.visibleCandles]
    );
    const { firstIndexToRender, lastIndexToRender } = useMemo(() => {
        const start = Math.floor(view.startIndex);
        const end = Math.ceil(view.startIndex + view.visibleCandles);
        return { firstIndexToRender: start, lastIndexToRender: end };
    }, [view.startIndex, view.visibleCandles]);
    const visibleData = useMemo(() => {
        if (data.length === 0) return [];
        const start = Math.max(0, firstIndexToRender);
        const end = Math.min(data.length, lastIndexToRender);
        return data.slice(start, end);
    }, [data, firstIndexToRender, lastIndexToRender]);
    const candleInterval = useMemo(() => {
        if (data.length < 2) {
            const TIMEFRAME_INTERVALS: { [key: string]: number } = {
                '1m': 60,
                '3m': 180,
                '5m': 300,
                '15m': 900,
                '30m': 1800,
                '45m': 2700,
                '1H': 3600,
                '2H': 7200,
                '3H': 10800,
                '4H': 14400,
                '1D': 86400,
                '1W': 604800,
                '1M': 2592000,
            };
            return TIMEFRAME_INTERVALS[activeTimeframe] || 3600;
        }
        return data[1].time - data[0].time;
    }, [data, activeTimeframe]);
    const indexToX = useMemo(
        () =>
            (index: number): number =>
                (index + 0.5) * xStep,
        [xStep]
    );
    const xToIndex = useMemo(
        () =>
            (x: number): number => {
                if (xStep <= 0) return 0;
                return Math.floor(x / xStep);
            },
        [xStep]
    );
    const yScale = useMemo(() => {
        return (price: number) => {
            if (priceRange.max === priceRange.min) return chartDimensions.height / 2;
            return (
                chartDimensions.height -
                ((price - priceRange.min) / (priceRange.max - priceRange.min)) *
                    chartDimensions.height
            );
        };
    }, [chartDimensions.height, priceRange]);
    const yToPrice = useMemo(
        () =>
            (y: number): number => {
                if (priceRange.max === priceRange.min) return priceRange.min;
                const chartHeight = chartDimensions.height;
                if (chartHeight <= 0) return 0;
                const priceRangeValue = priceRange.max - priceRange.min;
                const price = priceRange.max - (y / chartHeight) * priceRangeValue;
                return price;
            },
        [chartDimensions.height, priceRange]
    );
    const timeToX = useMemo(
        () =>
            (time: number): number => {
                if (!data || data.length === 0 || candleInterval <= 0 || !data[0]) return -100;
                const firstDataTime = data[0].time;
                const indexInData = (time - firstDataTime) / candleInterval;
                const indexInView = indexInData - view.startIndex;
                return indexToX(indexInView);
            },
        [data, candleInterval, view.startIndex, indexToX]
    );

    const xToTime = useMemo(
        () =>
            (x: number): number => {
                if (data.length === 0) {
                    return Math.floor(Date.now() / 1000);
                }

                const indexInView = xToIndex(x);
                const dataIndex = view.startIndex + indexInView;

                if (dataIndex < 0) {
                    const firstCandle = data[0];
                    return firstCandle ? firstCandle.time + dataIndex * candleInterval : 0;
                }

                if (dataIndex < data.length) {
                    const clampedIndex = Math.floor(dataIndex);
                    if (clampedIndex >= 0 && data[clampedIndex]) {
                        return data[clampedIndex].time;
                    }
                    const safeIndex = Math.min(Math.max(0, Math.round(dataIndex)), data.length - 1);
                    return data[safeIndex]?.time || 0;
                } else {
                    const lastDataIndex = data.length - 1;
                    const lastCandle = data[lastDataIndex];
                    if (lastCandle) {
                        return lastCandle.time + (dataIndex - lastDataIndex) * candleInterval;
                    }
                    return 0;
                }
            },
        [xToIndex, data, view.startIndex, candleInterval]
    );

    // Fractional version of xToTime — no candle snapping, for smooth brush drawing
    const xToTimeFractional = useMemo(
        () =>
            (x: number): number => {
                if (data.length === 0 || xStep <= 0 || !data[0])
                    return Math.floor(Date.now() / 1000);
                // Raw fractional index — NOT floored
                const indexInView = x / xStep - 0.5;
                const dataIndex = view.startIndex + indexInView;
                return data[0].time + dataIndex * candleInterval;
            },
        [xStep, data, view.startIndex, candleInterval]
    );

    const formatPrice = (price: number) => price.toFixed(price > 100 ? 2 : 5);
    const formatDate = (date: Date, format: string) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const monthShort = date.toLocaleString('default', { month: 'short' });
        return format
            .replace('YYYY', String(year))
            .replace('MM', month)
            .replace('DD', day)
            .replace('MMM', monthShort);
    };
    const formatTime = (date: Date, format: string) => {
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        if (format.includes('AM/PM')) {
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const hoursStr = String(hours);
            let result = format.replace('hh', hoursStr).replace('mm', minutes);
            if (format.includes('ss')) {
                result = result.replace('ss', seconds);
            }
            return result.replace(' AM/PM', ` ${ampm}`);
        } else {
            const hoursStr = String(hours).padStart(2, '0');
            let result = format.replace('hh', hoursStr).replace('mm', minutes);
            if (format.includes('ss')) {
                result = result.replace('ss', seconds);
            }
            return result;
        }
    };
    const formatTimeLabel = (timestamp: number, timeframe: string) => {
        const date = new Date(timestamp * 1000);
        const { dateFormat, timeFormat } = chartSettings.scalesAndLines;
        const formattedDate = formatDate(date, dateFormat);
        const formattedTime = formatTime(date, timeFormat);
        const intervalSeconds = candleInterval;
        if (intervalSeconds >= 86400) {
            return formattedDate;
        }
        if (intervalSeconds >= 3600) {
            return `${formattedDate} ${formattedTime.replace(/:ss| AM\/PM/g, '').trim()}`;
        }
        return formattedTime.replace(/:ss| AM\/PM/g, '').trim();
    };

    useEffect(() => {
        if (!tooltip.visible) {
            if (data.length > 0) {
                setHeaderOhlc(data[data.length - 1]);
            } else {
                setHeaderOhlc(null);
            }
        }
    }, [data, tooltip.visible]);
    useEffect(() => {
        if (isAutoScaling && visibleData.length > 0) {
            let dataMin = Infinity;
            let dataMax = -Infinity;
            for (const d of visibleData) {
                dataMin = Math.min(dataMin, d.low);
                dataMax = Math.max(dataMax, d.high);
            }
            if (dataMin === dataMax) {
                const price = dataMin;
                dataMin = price * 0.999;
                dataMax = price * 1.001;
                if (dataMin === dataMax) {
                    dataMin -= 0.001;
                    dataMax += 0.001;
                }
            }
            const buffer = (dataMax - dataMin) * 0.1;
            setPriceRange({ min: dataMin - buffer, max: dataMax + buffer });
        }
    }, [visibleData, isAutoScaling]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (editingText || isIndicatorPanelOpen || indicatorToEdit) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
                commitDrawingChange((prev) => prev.filter((d) => d.id !== selectedDrawingId));
                setSelectedDrawingId(null);
            }
            if (e.altKey && e.key.toLowerCase() === 'r') {
                e.preventDefault();
                resetView();
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    handleUndo();
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    handleRedo();
                }
            }
            if (e.key === 'Escape') {
                if (currentDrawing) {
                    setCurrentDrawing(null);
                    setActiveTool(null);
                }
                if (selectedDrawingId) {
                    setSelectedDrawingId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        selectedDrawingId,
        drawings,
        undoStack,
        redoStack,
        editingText,
        currentDrawing,
        isIndicatorPanelOpen,
        indicatorToEdit,
    ]);
    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    useEffect(() => {
        if (
            !chartSettings.scalesAndLines.showCountdown ||
            data.length === 0 ||
            candleInterval <= 0
        ) {
            setCountdown(null);
            return;
        }
        const timerId = setInterval(() => {
            const nowInSeconds = Math.floor(Date.now() / 1000);
            const nextBarTime = (Math.floor(nowInSeconds / candleInterval) + 1) * candleInterval;
            let secondsRemaining = nextBarTime - nowInSeconds;
            if (secondsRemaining < 0) secondsRemaining = 0;
            const minutes = Math.floor(secondsRemaining / 60);
            const seconds = secondsRemaining % 60;
            const formattedCountdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            setCountdown(formattedCountdown);
        }, 1000);
        return () => clearInterval(timerId);
    }, [chartSettings.scalesAndLines.showCountdown, data, candleInterval]);

    const yAxisLabels = useMemo(() => {
        if (priceRange.max === priceRange.min || !chartDimensions.height) return [];
        const range = priceRange.max - priceRange.min;
        if (range <= 0) return [];
        const numLabels = Math.max(1, Math.floor(chartDimensions.height / 30));
        const rawStep = range / numLabels;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const residual = rawStep / magnitude;
        let niceStep;
        if (residual > 5) {
            niceStep = 10 * magnitude;
        } else if (residual > 2.2) {
            niceStep = 5 * magnitude;
        } else if (residual > 1) {
            niceStep = 2 * magnitude;
        } else {
            niceStep = magnitude;
        }
        if (niceStep <= 0) return [];
        const labels = [];
        const firstLabel = Math.floor(priceRange.min / niceStep) * niceStep;
        for (let price = firstLabel; price < priceRange.max + niceStep; price += niceStep) {
            if (price >= priceRange.min) {
                labels.push({ y: yScale(price), price: formatPrice(price) });
            }
        }
        return labels;
    }, [yScale, priceRange, chartDimensions.height]);

    const xAxisLabels = useMemo(() => {
        if (!chartDimensions.width || data.length === 0 || xStep <= 0 || candleInterval <= 0)
            return [];

        const visibleTimeRange = view.visibleCandles * candleInterval;

        const intervals = [
            60, // 1 minute
            5 * 60, // 5 minutes
            15 * 60, // 15 minutes
            30 * 60, // 30 minutes
            60 * 60, // 1 hour
            2 * 60 * 60, // 2 hours
            4 * 60 * 60, // 4 hours
            12 * 60 * 60, // 12 hours
            24 * 60 * 60, // 1 day
            7 * 24 * 60 * 60, // 1 week
            30 * 24 * 60 * 60, // 1 month (approx)
            365 * 24 * 60 * 60, // 1 year (approx)
        ];

        const targetLabelSpacing = 120;
        const targetLabels = chartDimensions.width / targetLabelSpacing;
        const targetInterval = visibleTimeRange / targetLabels;

        const majorInterval =
            intervals.find((interval) => interval > targetInterval) ||
            intervals[intervals.length - 1];

        const labels = [];
        const firstVisibleTime = xToTime(0);
        const lastVisibleTime = xToTime(chartDimensions.width);

        const startOfLabels = Math.floor(firstVisibleTime / majorInterval) * majorInterval;

        for (
            let time = startOfLabels;
            time < lastVisibleTime + majorInterval;
            time += majorInterval
        ) {
            const x = timeToX(time);
            if (x >= -xStep && x < chartDimensions.width + xStep) {
                labels.push({ x, time });
            }
        }

        return labels;
    }, [
        view.visibleCandles,
        chartDimensions.width,
        xStep,
        candleInterval,
        timeToX,
        xToTime,
        data.length,
    ]);

    const getSnappedPoint = useMemo(
        () =>
            (
                svgX: number,
                svgY: number
            ): { point: Point; indicator: { x: number; y: number } | null } => {
                const unsnappedPoint = { time: xToTime(svgX), price: yToPrice(svgY) };
                if (xStep <= 0 || data.length === 0) {
                    return { point: unsnappedPoint, indicator: null };
                }
                const indexInViewRaw = svgX / xStep - 0.5;
                const closestDataIndex = Math.round(view.startIndex + indexInViewRaw);
                let bestSnap: {
                    point: Point;
                    indicator: { x: number; y: number };
                    distanceSq: number;
                } | null = null;
                const searchRadius = 2;
                for (let i = -searchRadius; i <= searchRadius; i++) {
                    const candleDataIndex = closestDataIndex + i;
                    if (candleDataIndex < 0 || candleDataIndex >= data.length) continue;
                    const candle = data[candleDataIndex];
                    if (!candle) continue;
                    const effectiveIndexInView = candleDataIndex - view.startIndex;
                    const candleX = indexToX(effectiveIndexInView);
                    const prices = [candle.open, candle.high, candle.low, candle.close];
                    for (const price of prices) {
                        const priceY = yScale(price);
                        const distanceSq = (svgX - candleX) ** 2 + (svgY - priceY) ** 2;
                        if (distanceSq < SNAP_THRESHOLD ** 2) {
                            if (!bestSnap || distanceSq < bestSnap.distanceSq) {
                                bestSnap = {
                                    point: { time: candle.time, price: price },
                                    indicator: { x: candleX, y: priceY },
                                    distanceSq: distanceSq,
                                };
                            }
                        }
                    }
                }
                if (bestSnap) {
                    return { point: bestSnap.point, indicator: bestSnap.indicator };
                } else {
                    return { point: unsnappedPoint, indicator: null };
                }
            },
        [data, view.startIndex, xStep, yScale, xToTime, yToPrice, indexToX]
    );

    useLayoutEffect(() => {
        {
            const chartCanvas = chartCanvasRef.current;
            const chartContext = chartCanvas?.getContext('2d');
            const startIdx = Math.max(0, firstIndexToRender);

            if (
                chartCanvas &&
                chartContext &&
                chartDimensions.width &&
                chartDimensions.height &&
                data.length
            ) {
                const dpr = Math.max(window.devicePixelRatio || 1, 2);
                chartCanvas.width = chartDimensions.width * dpr;
                chartCanvas.height = chartDimensions.height * dpr;
                chartCanvas.style.width = `${chartDimensions.width}px`;
                chartCanvas.style.height = `${chartDimensions.height}px`;
                chartContext.setTransform(dpr, 0, 0, dpr, 0, 0);
                chartContext.imageSmoothingEnabled = false;
                chartContext.clearRect(0, 0, chartDimensions.width, chartDimensions.height);

                if (chartSettings.canvas.backgroundType === 'gradient') {
                    const gradient = chartContext.createLinearGradient(
                        0,
                        0,
                        0,
                        chartDimensions.height
                    );
                    gradient.addColorStop(0, chartSettings.canvas.gradientStartColor);
                    gradient.addColorStop(1, chartSettings.canvas.gradientEndColor);
                    chartContext.fillStyle = gradient;
                } else {
                    chartContext.fillStyle = chartSettings.canvas.backgroundColor;
                }
                chartContext.fillRect(0, 0, chartDimensions.width, chartDimensions.height);

                if (chartSettings.canvas.showWatermark) {
                    chartContext.font = 'bold 48px Inter, sans-serif';
                    chartContext.fillStyle = chartSettings.canvas.watermarkColor;
                    chartContext.textAlign = 'center';
                    chartContext.textBaseline = 'middle';
                    const text = chartSettings.canvas.watermarkText || props.symbol;
                    chartContext.fillText(
                        text,
                        chartDimensions.width / 2,
                        chartDimensions.height / 2
                    );
                }

                if (chartSettings.scalesAndLines.showGrid) {
                    chartContext.strokeStyle = chartSettings.scalesAndLines.gridColor;
                    chartContext.lineWidth = 0.5;
                    yAxisLabels.forEach((label) => {
                        chartContext.beginPath();
                        chartContext.moveTo(0, label.y);
                        chartContext.lineTo(chartDimensions.width, label.y);
                        chartContext.stroke();
                    });
                    xAxisLabels.forEach((label) => {
                        chartContext.beginPath();
                        chartContext.moveTo(label.x, 0);
                        chartContext.lineTo(label.x, chartDimensions.height);
                        chartContext.stroke();
                    });
                }

                if (chartType === 'Candle') {
                    visibleData.forEach((d, i) => {
                        const dataIndex = startIdx + i;
                        const effectiveIndexInView = dataIndex - view.startIndex;
                        const x = indexToX(effectiveIndexInView);
                        const prevCandle = dataIndex > 0 ? data[dataIndex - 1] : null;
                        const isBullish =
                            chartSettings.symbol.colorBarsOnPrevClose && prevCandle
                                ? d.close >= prevCandle.close
                                : d.close >= d.open;

                        const bodyColor = isBullish
                            ? chartSettings.symbol.bodyUpColor
                            : chartSettings.symbol.bodyDownColor;
                        const borderColor = isBullish
                            ? chartSettings.symbol.borderUpColor
                            : chartSettings.symbol.borderDownColor;
                        const wickColor = isBullish
                            ? chartSettings.symbol.wickUpColor
                            : chartSettings.symbol.wickDownColor;

                        if (chartSettings.symbol.showWick) {
                            const wx = Math.round(x) + 0.5;
                            chartContext.beginPath();
                            chartContext.strokeStyle = wickColor;
                            chartContext.lineWidth = 1;
                            chartContext.moveTo(wx, Math.round(yScale(d.high)));
                            chartContext.lineTo(wx, Math.round(yScale(d.low)));
                            chartContext.stroke();
                        }

                        const bodyY = Math.round(isBullish ? yScale(d.close) : yScale(d.open));
                        const bodyHeight = Math.max(
                            1,
                            Math.abs(Math.round(yScale(d.open)) - Math.round(yScale(d.close)))
                        );
                        const bodyX = Math.round(x - xStep * 0.35);
                        const bodyWidth = Math.round(xStep * 0.7);

                        if (chartSettings.symbol.showBody) {
                            chartContext.fillStyle = bodyColor;
                            chartContext.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
                        }

                        if (chartSettings.symbol.showBorders) {
                            chartContext.strokeStyle = borderColor;
                            chartContext.lineWidth = 1;
                            chartContext.strokeRect(
                                bodyX + 0.5,
                                bodyY + 0.5,
                                bodyWidth - 1,
                                bodyHeight - 1
                            );
                        }
                    });
                } else if (chartType === 'Line') {
                    chartContext.strokeStyle = '#3B82F6';
                    chartContext.lineWidth = 1.5;
                    chartContext.beginPath();
                    let firstPoint = true;
                    visibleData.forEach((d, i) => {
                        const dataIndex = startIdx + i;
                        const effectiveIndexInView = dataIndex - view.startIndex;
                        const x = indexToX(effectiveIndexInView);
                        const y = yScale(d.close);
                        if (firstPoint) {
                            chartContext.moveTo(x, y);
                            firstPoint = false;
                        } else {
                            chartContext.lineTo(x, y);
                        }
                    });
                    chartContext.stroke();
                }

                if (chartSettings.scalesAndLines.showLastPriceLabel && data.length > 0) {
                    const lastCandle = data[data.length - 1];
                    const prevCandle = data.length > 1 ? data[data.length - 2] : null;
                    const isUp = prevCandle ? lastCandle.close >= prevCandle.close : true;
                    const y = yScale(lastCandle.close);

                    chartContext.setLineDash([4, 4]);
                    chartContext.strokeStyle = isUp
                        ? chartSettings.symbol.bodyUpColor
                        : chartSettings.symbol.bodyDownColor;
                    chartContext.lineWidth = 1;
                    chartContext.beginPath();
                    chartContext.moveTo(0, y);
                    chartContext.lineTo(chartDimensions.width, y);
                    chartContext.stroke();
                    chartContext.setLineDash([]);
                }
            }

            const yAxisCanvas = yAxisCanvasRef.current;
            const yAxisContext = yAxisCanvas?.getContext('2d');
            if (yAxisCanvas && yAxisContext && yAxisDimensions.width && yAxisDimensions.height) {
                const dpr = Math.max(window.devicePixelRatio || 1, 2);
                yAxisCanvas.width = yAxisDimensions.width * dpr;
                yAxisCanvas.height = yAxisDimensions.height * dpr;
                yAxisCanvas.style.width = `${yAxisDimensions.width}px`;
                yAxisCanvas.style.height = `${yAxisDimensions.height}px`;
                yAxisContext.setTransform(dpr, 0, 0, dpr, 0, 0);
                yAxisContext.imageSmoothingEnabled = false;
                yAxisContext.clearRect(0, 0, yAxisDimensions.width, yAxisDimensions.height);
                yAxisContext.fillStyle = chartSettings.canvas.backgroundColor;
                yAxisContext.fillRect(0, 0, yAxisDimensions.width, yAxisDimensions.height);
                yAxisContext.font = '12px "Geist", "Inter", sans-serif';
                yAxisContext.fillStyle = chartSettings.canvas.textColor;
                yAxisContext.textAlign = 'left';
                yAxisLabels.forEach((label) => {
                    yAxisContext.fillText(label.price, 6, label.y + 4);
                });

                const lastCandle = data.length > 0 ? data[data.length - 1] : null;
                if (lastCandle) {
                    const lastPrice = lastCandle.close;
                    const lastPriceY = yScale(lastPrice);
                    const prevCandle = data.length > 1 ? data[data.length - 2] : null;
                    const isUp = prevCandle ? lastPrice >= prevCandle.close : true;

                    const hasCountdown = chartSettings.scalesAndLines.showCountdown && countdown;
                    const labelHeight = hasCountdown ? 34 : 20;
                    const labelY = Math.max(
                        0,
                        Math.min(lastPriceY - labelHeight / 2, yAxisDimensions.height - labelHeight)
                    );

                    if (chartSettings.scalesAndLines.showLastPriceLabel) {
                        const bgColor = isUp
                            ? chartSettings.symbol.bodyUpColor
                            : chartSettings.symbol.bodyDownColor;
                        yAxisContext.fillStyle = bgColor;
                        yAxisContext.fillRect(0, labelY, yAxisDimensions.width, labelHeight);

                        const textColor = getTextColorForBackground(bgColor);
                        yAxisContext.fillStyle = textColor;
                        yAxisContext.textAlign = 'left';

                        if (hasCountdown) {
                            yAxisContext.font = 'bold 12px "Geist", "Inter", sans-serif';
                            yAxisContext.fillText(formatPrice(lastPrice), 6, labelY + 12);
                            yAxisContext.font = '12px "Geist", "Inter", sans-serif';
                            yAxisContext.fillText(countdown!, 6, labelY + 26);
                        } else {
                            yAxisContext.font = 'bold 12px "Geist", "Inter", sans-serif';
                            yAxisContext.fillText(formatPrice(lastPrice), 6, labelY + 14);
                        }
                    }
                }
                if (chartSettings.scalesAndLines.showPriceLabels) {
                    const labels: LabelInfo[] = [];
                    drawings.forEach((d) => {
                        if (d.isVisible === false) return;
                        switch (d.type) {
                            case 'Horizontal Line':
                                labels.push({
                                    price: d.price,
                                    color: d.style.color,
                                    text: formatPrice(d.price),
                                });
                                break;
                            case 'Ray':
                                if (d.end)
                                    labels.push({
                                        price: d.end.price,
                                        color: d.style.color,
                                        text: formatPrice(d.end.price),
                                    });
                                break;
                            case 'Horizontal Ray':
                                if (d.start)
                                    labels.push({
                                        price: d.start.price,
                                        color: d.style.color,
                                        text: formatPrice(d.start.price),
                                    });
                                break;
                        }
                    });

                    labels.forEach((label) => {
                        const y = yScale(label.price);
                        if (y >= 0 && y <= yAxisDimensions.height) {
                            yAxisContext.fillStyle = label.color;
                            yAxisContext.fillRect(0, y - 10, yAxisDimensions.width, 20);
                            yAxisContext.fillStyle = getTextColorForBackground(label.color);
                            yAxisContext.fillText(label.text || '', 6, y + 4);
                        }
                    });
                }

                if (
                    tooltip.visible &&
                    chartSettings.scalesAndLines.showCrosshair &&
                    tooltip.y >= 0 &&
                    tooltip.y <= yAxisDimensions.height
                ) {
                    const price = yToPrice(tooltip.y);
                    const priceY = tooltip.y;
                    let canDraw = true;
                    if (lastCandle && chartSettings.scalesAndLines.showLastPriceLabel) {
                        const lastPriceY = yScale(lastCandle.close);
                        if (Math.abs(priceY - lastPriceY) < 12) {
                            canDraw = false;
                        }
                    }

                    if (canDraw) {
                        yAxisContext.fillStyle = '#3B82F6'; // blue-500
                        yAxisContext.fillRect(0, priceY - 9, yAxisDimensions.width, 18);
                        yAxisContext.fillStyle = '#FFFFFF'; // white text
                        yAxisContext.textAlign = 'left';
                        yAxisContext.font = 'bold 12px "Geist", "Inter", sans-serif';
                        yAxisContext.fillText(formatPrice(price), 6, priceY + 4);
                    }
                }
            }

            const xAxisCanvas = xAxisCanvasRef.current;
            const xAxisContext = xAxisCanvas?.getContext('2d');
            if (xAxisCanvas && xAxisContext && xAxisDimensions.width && xAxisDimensions.height) {
                const dpr = Math.max(window.devicePixelRatio || 1, 2);
                xAxisCanvas.width = xAxisDimensions.width * dpr;
                xAxisCanvas.height = xAxisDimensions.height * dpr;
                xAxisCanvas.style.width = `${xAxisDimensions.width}px`;
                xAxisCanvas.style.height = `${xAxisDimensions.height}px`;
                xAxisContext.setTransform(dpr, 0, 0, dpr, 0, 0);
                xAxisContext.imageSmoothingEnabled = false;
                xAxisContext.clearRect(0, 0, xAxisDimensions.width, xAxisDimensions.height);
                xAxisContext.fillStyle = chartSettings.canvas.backgroundColor;
                xAxisContext.fillRect(0, 0, xAxisDimensions.width, xAxisDimensions.height);
                xAxisContext.font = '12px "Geist", "Inter", sans-serif';
                xAxisContext.fillStyle = chartSettings.canvas.textColor;
                xAxisContext.textAlign = 'center';
                xAxisLabels.forEach((label) => {
                    xAxisContext.fillText(
                        formatTimeLabel(label.time, activeTimeframe),
                        label.x,
                        16
                    );
                });

                if (
                    tooltip.visible &&
                    chartSettings.scalesAndLines.showCrosshair &&
                    tooltip.x >= 0 &&
                    tooltip.x <= xAxisDimensions.width
                ) {
                    const timeX = tooltip.x;
                    const timeAtCursor = xToTime(timeX);
                    const labelWidth = 100;
                    xAxisContext.fillStyle = '#3B82F6'; // blue-500
                    xAxisContext.fillRect(
                        timeX - labelWidth / 2,
                        0,
                        labelWidth,
                        xAxisDimensions.height
                    );
                    xAxisContext.fillStyle = '#FFFFFF';
                    xAxisContext.textAlign = 'center';
                    xAxisContext.font = 'bold 12px "Geist", "Inter", sans-serif';
                    xAxisContext.fillText(
                        formatTimeLabel(timeAtCursor, activeTimeframe),
                        timeX,
                        16
                    );
                }
            }
        }
    }, [
        visibleData,
        chartDimensions,
        xStep,
        yScale,
        indexToX,
        priceRange,
        yAxisLabels,
        yAxisDimensions,
        alerts,
        countdown,
        xAxisLabels,
        xAxisDimensions,
        activeTimeframe,
        panelIndicators,
        view,
        chartType,
        chartSettings,
        openPositions,
        isBottomPanelOpen,
        rightPanel,
        order,
        headerOhlc,
        data,
        firstIndexToRender,
        lastIndexToRender,
        tooltip,
        xToTime,
    ]);

    // Panel Indicators Drawing Effect
    useEffect(() => {
        panelIndicators.forEach((indicator) => {
            const refs = indicatorCanvasRefs.current.get(indicator.id);
            if (!refs || !refs.chart || !refs.yAxis) return;

            const canvas = refs.chart;
            const ctx = canvas.getContext('2d');
            const yAxisCanvas = refs.yAxis;
            const yAxisCtx = yAxisCanvas.getContext('2d');

            if (!ctx || !yAxisCtx) return;

            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            const yAxisWidth = yAxisCanvas.clientWidth;
            const yAxisHeight = yAxisCanvas.clientHeight; // Should match canvas height

            const dpr = Math.max(window.devicePixelRatio || 1, 2);

            // Setup Canvas
            if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.imageSmoothingEnabled = false;
            }
            if (
                yAxisCanvas.width !== yAxisWidth * dpr ||
                yAxisCanvas.height !== yAxisHeight * dpr
            ) {
                yAxisCanvas.width = yAxisWidth * dpr;
                yAxisCanvas.height = yAxisHeight * dpr;
                yAxisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                yAxisCtx.imageSmoothingEnabled = false;
            }

            // Clear
            ctx.clearRect(0, 0, width, height);
            yAxisCtx.clearRect(0, 0, yAxisWidth, yAxisHeight);

            // Visibility Check: Stop drawing if hidden (after clear!)
            if (indicator.isVisible === false) return;

            // Backgrounds
            ctx.fillStyle = chartSettings.canvas.backgroundColor;
            ctx.fillRect(0, 0, width, height);
            yAxisCtx.fillStyle = chartSettings.canvas.backgroundColor;
            yAxisCtx.fillRect(0, 0, yAxisWidth, yAxisHeight);

            if (!indicator.data || Object.keys(indicator.data).length === 0) return;

            // Determine Scale (Min/Max)
            let min = Infinity,
                max = -Infinity;
            const isBounded = ['RSI', 'Stochastic', 'MFI', 'CCI', 'ADX'].includes(indicator.type);

            // Auto-scale based on VISIBLE data for all indicator types
            visibleData.forEach((_, i) => {
                const dataIndex = firstIndexToRender + i;
                const check = (val: any) => {
                    if (typeof val === 'number' && !isNaN(val)) {
                        min = Math.min(min, val);
                        max = Math.max(max, val);
                    }
                };

                const mainVal = indicator.data.main?.[dataIndex];
                check(mainVal);

                if (indicator.type === 'MACD') {
                    check(indicator.data.macd?.[dataIndex]);
                    check(indicator.data.signal?.[dataIndex]);
                    check(indicator.data.histogram?.[dataIndex]);
                }
                if (indicator.type === 'Stochastic') {
                    check(indicator.data.k?.[dataIndex]);
                    check(indicator.data.d?.[dataIndex]);
                }
                if ((indicator.type as string) === 'Bollinger Bands') {
                    check(indicator.data.upper?.[dataIndex]);
                    check(indicator.data.lower?.[dataIndex]);
                }
            });

            if (isBounded) {
                if (
                    indicator.type === 'Stochastic' ||
                    indicator.type === 'RSI' ||
                    indicator.type === 'MFI'
                ) {
                    // Fixed 0-100 range — values are always within this range
                    min = 0;
                    max = 100;
                } else if (indicator.type === 'CCI') {
                    min = Math.min(min === Infinity ? -100 : min, -100);
                    max = Math.max(max === -Infinity ? 100 : max, 100);
                } else if (indicator.type === 'ADX') {
                    min = 0;
                    max = 100;
                } else {
                    if (min === Infinity) {
                        min = 0;
                        max = 100;
                    }
                }
            } else {
                if (min === Infinity) {
                    min = 0;
                    max = 100;
                }
                if (min === max) {
                    min -= 1;
                    max += 1;
                }
                // Add padding
                const padding = (max - min) * 0.1;
                min -= padding;
                max += padding;
            }

            const panelPadding = height * 0.08; // 8% padding top and bottom
            const drawHeight = height - 2 * panelPadding;
            const getPanelY = (val: number) => {
                if (max === min) return height / 2;
                return panelPadding + drawHeight - ((val - min) / (max - min)) * drawHeight;
            };

            // Draw Y-Axis Labels
            yAxisCtx.fillStyle = chartSettings.canvas.textColor;
            yAxisCtx.font = '11px "Geist", "Inter", sans-serif';
            yAxisCtx.textAlign = 'left';

            // Draw regular grid lines/labels
            const numLabels = Math.floor(height / 30);
            for (let i = 1; i < numLabels; i++) {
                const t = i / numLabels;
                const val = max - (max - min) * t;
                const y = height * t;
                yAxisCtx.fillText(val.toFixed(2), 6, y + 3);

                // Grid line on main chart
                ctx.strokeStyle = chartSettings.scalesAndLines.gridColor;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Draw Logic based on Type
            // Apply user style settings (lineWidth, lineStyle)
            const userLineWidth = (indicator.settings as any)?.lineWidth || 1.5;
            const userLineStyle = (indicator.settings as any)?.lineStyle || 'solid';
            ctx.lineWidth = userLineWidth;

            // Set dash pattern based on lineStyle
            const dashPatterns: Record<string, number[]> = {
                solid: [],
                dashed: [6, 3],
                dotted: [2, 2],
            };
            ctx.setLineDash(dashPatterns[userLineStyle] || []);

            const drawLine = (dataArr: (number | null)[], color: string) => {
                ctx.beginPath();
                ctx.strokeStyle = color;
                let started = false;

                for (let i = 0; i < view.visibleCandles; i++) {
                    const dataIndex = Math.floor(view.startIndex) + i;
                    const val = dataArr[dataIndex];
                    if (val === null || val === undefined || isNaN(val as number)) {
                        started = false;
                        continue;
                    }

                    const x = indexToX(dataIndex - view.startIndex);
                    const y = getPanelY(val);

                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            };

            if (indicator.type === 'MACD') {
                // Histogram
                const hist = indicator.data.histogram;
                if (hist) {
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        const val = hist[dataIndex];
                        if (val === null || val === undefined) continue;

                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val);
                        const zeroY = getPanelY(0);

                        ctx.fillStyle = val >= 0 ? '#26a69a' : '#ef5350';
                        ctx.globalAlpha = 0.5;
                        const barWidth = xStep * 0.8;
                        // Center bar on x
                        ctx.fillRect(
                            x - barWidth / 2,
                            Math.min(y, zeroY),
                            barWidth,
                            Math.abs(y - zeroY)
                        );
                    }
                    ctx.globalAlpha = 1;
                }

                if (indicator.data.macd)
                    drawLine(
                        indicator.data.macd,
                        (indicator.settings as any).macdColor || '#2962FF'
                    );
                if (indicator.data.signal)
                    drawLine(
                        indicator.data.signal,
                        (indicator.settings as any).signalColor || '#FF6D00'
                    );
            } else if (indicator.type === 'Stochastic') {
                const k = indicator.data.k;
                const d = indicator.data.d;

                // Fill between 80-20 bands — Pine: fill(h0, h1, color=color.rgb(33, 150, 243, 90))
                const y80 = getPanelY(80);
                const y20 = getPanelY(20);
                ctx.fillStyle = 'rgba(33, 150, 243, 0.10)';
                ctx.fillRect(0, y80, width, y20 - y80);

                // Draw Levels (20, 50, 80)
                [20, 50, 80].forEach((level) => {
                    const y = getPanelY(level);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = '#E0E0E0';
                    ctx.globalAlpha = level === 50 ? 0.5 : 1;
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                });

                if (k) drawLine(k, (indicator.settings as any).kColor || '#2962FF');
                if (d) drawLine(d, (indicator.settings as any).dColor || '#FF6D00');
            } else if (indicator.type === 'CCI') {
                // CCI with levels at +100, 0, -100
                const main = indicator.data.main;

                // Draw Levels
                [100, 0, -100].forEach((level) => {
                    const y = getPanelY(level);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle =
                        level === 0 ? '#E0E0E0' : chartSettings.scalesAndLines.gridColor;
                    ctx.globalAlpha = level === 0 ? 0.8 : 0.5;
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                });

                if (main) drawLine(main, indicator.settings.color || '#FF9800');
            } else if (indicator.type === 'ADX') {
                // ADX with levels at 25 and 50
                const main = indicator.data.main;

                // Draw Levels
                [25, 50].forEach((level) => {
                    const y = getPanelY(level);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = chartSettings.scalesAndLines.gridColor;
                    ctx.globalAlpha = 0.5;
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                });

                if (main) drawLine(main, indicator.settings.color || '#3F51B5');
            } else if (indicator.type === 'MFI') {
                // MFI with levels at 20 and 80
                const main = indicator.data.main;

                // Draw Levels
                [20, 80].forEach((level) => {
                    const y = getPanelY(level);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = chartSettings.scalesAndLines.gridColor;
                    ctx.globalAlpha = 0.5;
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                });

                if (main) drawLine(main, indicator.settings.color || '#3B82F6');
            } else if (indicator.type === 'OBV') {
                // OBV - no specific levels, just draw the line
                const main = indicator.data.main;
                if (main) drawLine(main, indicator.settings.color || '#10B981');
            } else if (indicator.type === 'KURI_HISTOGRAM' || indicator.type === 'KURI_COLUMNS') {
                // Kuri Histogram — bars above/below zero line
                const main = indicator.data.main;
                if (main) {
                    // Draw zero line
                    const zeroY = getPanelY(0);
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(0, zeroY);
                    ctx.lineTo(width, zeroY);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    const upColor = (indicator.settings as any)?.histogramUpColor || '#26a69a';
                    const downColor = (indicator.settings as any)?.histogramDownColor || '#ef5350';
                    const barW = Math.max(1, xStep * 0.6);
                    const hStart = Math.max(0, Math.floor(view.startIndex));
                    const hEnd = Math.min(
                        main.length,
                        Math.ceil(view.startIndex + view.visibleCandles)
                    );
                    for (let i = hStart; i < hEnd; i++) {
                        const val = main[i];
                        if (val === null || val === undefined) continue;
                        const x = (i - view.startIndex) * xStep + xStep / 2 - barW / 2;
                        const y = getPanelY(val);
                        const barHeight = Math.abs(y - zeroY);
                        ctx.fillStyle = val >= 0 ? upColor : downColor;
                        ctx.fillRect(x, Math.min(y, zeroY), barW, Math.max(1, barHeight));
                    }
                }
            } else if (indicator.type === 'KURI_LINE' || indicator.type === 'KURI_AREA') {
                // Kuri line/area in panel mode (when kuriOverlay is false)
                const main = indicator.data.main;
                if (main) {
                    drawLine(main, indicator.settings.color || '#FF9800');
                    // For area, add fill below
                    if (indicator.type === 'KURI_AREA') {
                        const aStart = Math.max(0, Math.floor(view.startIndex));
                        const aEnd = Math.min(
                            main.length,
                            Math.ceil(view.startIndex + view.visibleCandles)
                        );
                        ctx.globalAlpha = 0.1;
                        ctx.fillStyle = indicator.settings.color || '#FF9800';
                        ctx.beginPath();
                        let started = false;
                        for (let i = aStart; i < aEnd; i++) {
                            const val = main[i];
                            if (val === null || val === undefined) continue;
                            const x = (i - view.startIndex) * xStep + xStep / 2;
                            const y = getPanelY(val);
                            if (!started) {
                                ctx.moveTo(x, y);
                                started = true;
                            } else ctx.lineTo(x, y);
                        }
                        ctx.lineTo(
                            (aEnd - 1 - view.startIndex) * xStep + xStep / 2,
                            panelPadding + drawHeight
                        );
                        ctx.lineTo(
                            (aStart - view.startIndex) * xStep + xStep / 2,
                            panelPadding + drawHeight
                        );
                        ctx.closePath();
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                }
            } else {
                // Standard Single Line (RSI, MFI, etc.)
                const main = indicator.data.main;
                if (main) {
                    // Levels for oscillating indicators
                    if (isBounded) {
                        const levels = indicator.type === 'RSI' ? [30, 70] : [20, 80]; // default

                        levels.forEach((level) => {
                            const y = getPanelY(level);
                            ctx.beginPath();
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                            // Could do fill between 70/30
                            ctx.setLineDash([4, 4]);
                            ctx.strokeStyle = '#E0E0E0';
                            ctx.moveTo(0, y);
                            ctx.lineTo(width, y);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        });
                    }

                    drawLine(main, indicator.settings.color || '#2962FF');
                }
            }

            // Reset line dash and width after indicator drawing
            ctx.setLineDash([]);
            ctx.lineWidth = 1.5;

            // Draw Crosshair info if exists
            if (tooltip.visible && tooltip.x >= 0 && tooltip.x <= width) {
                const timeX = tooltip.x;
                const indexInView = timeX / xStep - 0.5;
                const dataIndex = Math.round(view.startIndex + indexInView);
                const safeIndex = Math.max(0, Math.min(data.length - 1, dataIndex));

                // Display Value Label on Y-Axis
                // We need to know WHICH value to show. Usually main.
                // For MACD maybe show all? complex.
                // Just simple implementation: show main or first available
                let valToShow: number | null = null;

                // Prioritize main
                if (indicator.data.main) valToShow = indicator.data.main[safeIndex];
                else if (indicator.data.macd) valToShow = indicator.data.macd[safeIndex];
                else if (indicator.data.k) valToShow = indicator.data.k[safeIndex];

                if (valToShow !== null && valToShow !== undefined) {
                    const y = getPanelY(valToShow);
                    // Label background
                    yAxisCtx.fillStyle = '#2962FF';
                    yAxisCtx.fillRect(0, y - 10, yAxisWidth, 20);
                    yAxisCtx.fillStyle = '#fff';
                    yAxisCtx.fillText(valToShow.toFixed(2), 6, y + 4);

                    // Crosshair line on panel
                    ctx.beginPath();
                    ctx.strokeStyle = '#E0E0E0';
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(timeX, 0);
                    ctx.lineTo(timeX, height);
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Dot
                    const pointX = indexToX(safeIndex - view.startIndex);
                    ctx.beginPath();
                    ctx.fillStyle = indicator.settings.color || '#2962FF';
                    ctx.arc(pointX, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        });
    }, [
        panelIndicators,
        firstIndexToRender,
        view,
        visibleData,
        chartSettings,
        xStep,
        indexToX,
        tooltip,
        data,
    ]);

    const distSq = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
        (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    const distToSegmentSquared = (
        p: { x: number; y: number },
        v: { x: number; y: number },
        w: { x: number; y: number }
    ) => {
        const l2 = distSq(v, w);
        if (l2 === 0) return distSq(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return distSq(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    };
    const perpendicularDistanceSquared = (
        p: { x: number; y: number },
        v: { x: number; y: number },
        w: { x: number; y: number }
    ) => {
        const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    };

    const findDrawingAtPoint = (
        svgX: number,
        svgY: number
    ): { drawing: Drawing; handle?: string } | null => {
        // Check selection in reverse order to pick the topmost drawing
        for (let i = drawings.length - 1; i >= 0; i--) {
            const d = drawings[i];
            if (d.isVisible === false) continue;
            const p = { x: svgX, y: svgY };

            if (d.type === 'Horizontal Line') {
                const y = yScale(d.price);
                if (Math.abs(p.y - y) < HITBOX_WIDTH) return { drawing: d };
            } else if (d.type === 'Vertical Line') {
                const x = timeToX(d.time);
                if (Math.abs(p.x - x) < HITBOX_WIDTH) return { drawing: d };
            } else if (d.type === 'Horizontal Ray') {
                if (!d.start) continue;
                const start = { x: timeToX(d.start.time), y: yScale(d.start.price) };
                if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
                if (Math.abs(p.y - start.y) < HITBOX_WIDTH && p.x >= start.x) return { drawing: d };
            } else if (d.type === 'Text Note') {
                if (!d.point) continue;
                const x = timeToX(d.point.time);
                const y = yScale(d.point.price);

                const fontSize = d.style.fontSize || 14;
                const tnPad = 10;
                const tnLines = d.text.split('\n');
                const tnMaxLine = Math.max(...tnLines.map((l) => l.length), 4);
                const textWidth = Math.max(tnMaxLine * (fontSize * 0.58) + tnPad * 2 + 6, 60);
                const tnLineH = fontSize * 1.5;
                const textHeight = tnLines.length * tnLineH + tnPad * 2 + 4;
                const cardX = x + 10;
                const cardY = y - textHeight;

                // Pin hit area
                if (distSq(p, { x, y }) < 64) return { drawing: d };
                // Card hit area
                if (
                    p.x >= cardX &&
                    p.x <= cardX + textWidth &&
                    p.y >= cardY &&
                    p.y <= cardY + textHeight
                ) {
                    return { drawing: d };
                }
            } else if (d.type === 'Callout') {
                if (!d.anchor || !d.label) continue;
                const anchor = { x: timeToX(d.anchor.time), y: yScale(d.anchor.price) };
                const label = { x: timeToX(d.label.time), y: yScale(d.label.price) };

                if (distSq(p, anchor) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'anchor' };

                const fontSize = d.style.fontSize || 13;
                const coPad = 12;
                const coLines = d.text.split('\n');
                const coMaxLine = Math.max(...coLines.map((l) => l.length), 4);
                const coW = Math.max(coMaxLine * (fontSize * 0.58) + coPad * 2 + 8, 80);
                const coLineH = fontSize * 1.5;
                const coH = coLines.length * coLineH + coPad * 2 + 4;

                // Text box hit — dragging moves the label (text box position)
                if (
                    p.x >= label.x &&
                    p.x <= label.x + coW &&
                    p.y >= label.y &&
                    p.y <= label.y + coH
                ) {
                    return { drawing: d, handle: 'label' };
                }
            } else if (
                d.type === 'Price Label' ||
                d.type === 'Signal Marker' ||
                d.type === 'Note Flag' ||
                d.type === 'Emoji Sticker'
            ) {
                if (!d.point) continue;
                const ptX = timeToX(d.point.time);
                const ptY = yScale(d.point.price);
                const hitR = d.type === 'Emoji Sticker' ? 22 : 20;
                if (distSq(p, { x: ptX, y: ptY }) < hitR * hitR) return { drawing: d };
                // For Price Label, also check the tag area
                if (d.type === 'Price Label') {
                    const plText = (d as any).text || '';
                    const plW = Math.max(plText.length * 8 + 20, 70);
                    if (
                        p.x >= ptX - plW / 2 &&
                        p.x <= ptX + plW / 2 &&
                        p.y >= ptY - 14 &&
                        p.y <= ptY + 14
                    )
                        return { drawing: d };
                }
            } else if (d.type === 'Parallel Channel') {
                if (!d.start || !d.end || !d.p2) continue;
                const start = { x: timeToX(d.start.time), y: yScale(d.start.price) };
                const end = { x: timeToX(d.end.time), y: yScale(d.end.price) };
                const p2 = { x: timeToX(d.p2.time), y: yScale(d.p2.price) };

                if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
                if (distSq(p, end) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'end' };
                // p2 handle logic - strictly p2 point
                if (distSq(p, p2) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'p2' };

                // Line 1 check (Start->End)
                if (distToSegmentSquared(p, start, end) < HITBOX_WIDTH ** 2) return { drawing: d };

                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const len = Math.sqrt(dx * dx + dy * dy);

                if (len > 0) {
                    const nx = -dy / len;
                    const ny = dx / len;

                    // Calc Line 2
                    // P2 offset from Start
                    const v13x = p2.x - start.x;
                    const v13y = p2.y - start.y;
                    const distWidth = v13x * nx + v13y * ny; // Signed width

                    // Line 2 Points
                    const offsetX = nx * distWidth;
                    const offsetY = ny * distWidth;
                    const l2_start = { x: start.x + offsetX, y: start.y + offsetY };
                    const l2_end = { x: end.x + offsetX, y: end.y + offsetY };

                    // NEW: Check Line 2 End Handle
                    if (distSq(p, l2_end) < HANDLE_RADIUS ** 2)
                        return { drawing: d, handle: 'p2_end' };

                    // Line 2 check
                    if (distToSegmentSquared(p, l2_start, l2_end) < HITBOX_WIDTH ** 2)
                        return { drawing: d };

                    // Channel Body check (strictly between lines)
                    // Project point p onto Normal
                    const v1px = p.x - start.x;
                    const v1py = p.y - start.y;
                    const pDist = v1px * nx + v1py * ny;

                    // Check if pDist is between 0 and distWidth
                    // Since distWidth can be negative, we check based on signs or min/max
                    if (pDist * distWidth >= 0 && Math.abs(pDist) <= Math.abs(distWidth)) {
                        // Check longitudinal (along the line)
                        const t = (v1px * dx + v1py * dy) / (len * len);
                        if (t >= 0 && t <= 1) {
                            return { drawing: d };
                        }
                    }
                }
            } else if (d.type === 'Fibonacci Retracement') {
                if (!d.start || !d.end) continue;
                const start = { x: timeToX(d.start.time), y: yScale(d.start.price) };
                const end = { x: timeToX(d.end.time), y: yScale(d.end.price) };

                if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
                if (distSq(p, end) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'end' };

                // Check trendline
                if (distToSegmentSquared(p, start, end) < HITBOX_WIDTH ** 2) return { drawing: d };

                // Check horizontal levels
                const priceDiff = d.end.price - d.start.price;
                for (const level of d.style.levels || FIB_LEVELS) {
                    const y = yScale(d.start.price + priceDiff * level);
                    const x_min = Math.min(start.x, end.x);
                    const x_max = Math.max(start.x, end.x);
                    if (Math.abs(p.y - y) < HITBOX_WIDTH && p.x >= x_min && p.x <= x_max) {
                        return { drawing: d };
                    }
                }
            } else if (d.type === 'Long Position' || d.type === 'Short Position') {
                const pos = d as any;
                if (!pos.entry || !pos.profit || !pos.stop) continue;
                const entryY = yScale(pos.entry.price);
                const profitY = yScale(pos.profit.price);
                const stopY = yScale(pos.stop.price);
                const entryX = timeToX(pos.entry.time);
                const profitX = timeToX(pos.profit.time);
                const xL = Math.min(entryX, profitX);
                const xR = Math.max(entryX, profitX, xL + 10);
                const bW = xR - xL;
                const posTopY = Math.min(entryY, profitY, stopY);
                const posBotY = Math.max(entryY, profitY, stopY);
                const hR = HANDLE_RADIUS + 4;

                // Circle handle hit areas — only when selected, on left edge
                if (selectedDrawingId === d.id) {
                    const handleR = 12;
                    if (distSq(p, { x: xL, y: profitY }) < handleR * handleR)
                        return { drawing: d, handle: 'tp' };
                    if (distSq(p, { x: xL, y: stopY }) < handleR * handleR)
                        return { drawing: d, handle: 'sl' };
                    if (distSq(p, { x: xL, y: entryY }) < handleR * handleR)
                        return { drawing: d, handle: 'entryLeft' };
                    if (distSq(p, { x: xR, y: entryY }) < handleR * handleR)
                        return { drawing: d, handle: 'entryRight' };
                }

                // Line hit areas — click on any horizontal line to drag it
                const lineHitSize = 8;
                if (p.x >= xL && p.x <= xR && Math.abs(p.y - profitY) < lineHitSize)
                    return { drawing: d, handle: 'tp' };
                if (p.x >= xL && p.x <= xR && Math.abs(p.y - stopY) < lineHitSize)
                    return { drawing: d, handle: 'sl' };
                if (p.x >= xL && p.x <= xR && Math.abs(p.y - entryY) < lineHitSize)
                    return { drawing: d, handle: 'entryBand' };

                // Body: anywhere inside = move the whole drawing
                if (p.x >= xL - 22 && p.x <= xR + 8 && p.y >= posTopY - 8 && p.y <= posBotY + 8)
                    return { drawing: d };
            } else if (d.type === 'Path' || d.type === 'Brush') {
                if (d.points.length < 2) continue;

                // Check handles first (for Path)
                if (d.type === 'Path') {
                    for (let i = 0; i < d.points.length; i++) {
                        const point = {
                            x: timeToX(d.points[i].time),
                            y: yScale(d.points[i].price),
                        };
                        if (distSq(p, point) < HANDLE_RADIUS ** 2)
                            return { drawing: d, handle: `p${i}` as any };
                    }
                }

                // Check proximity to any segment
                let hit = false;
                for (let i = 0; i < d.points.length - 1; i++) {
                    const p1 = { x: timeToX(d.points[i].time), y: yScale(d.points[i].price) };
                    const p2 = {
                        x: timeToX(d.points[i + 1].time),
                        y: yScale(d.points[i + 1].price),
                    };
                    if (distToSegmentSquared(p, p1, p2) < HITBOX_WIDTH ** 2) {
                        hit = true;
                        break;
                    }
                }

                if (hit) return { drawing: d };
            } else if ('start' in d && 'end' in d) {
                // Standard 2-point tools (Trend Line, Rectangle, etc.)
                const hasStart = 'start' in d;
                const hasEnd = 'end' in d;

                if (hasStart && hasEnd) {
                    const startPoint = (d as any).start;
                    const endPoint = (d as any).end;
                    if (!startPoint || !endPoint) continue;

                    const start = { x: timeToX(startPoint.time), y: yScale(startPoint.price) };
                    const end = { x: timeToX(endPoint.time), y: yScale(endPoint.price) };

                    if (d.type === 'Rectangle' || d.type === 'Gann Box') {
                        const c3 = { x: start.x, y: end.y };
                        const c4 = { x: end.x, y: start.y };

                        // Check all 4 corner handles with generous radius
                        const hRadiusSq = (HANDLE_RADIUS + 6) ** 2; // ~14px radius
                        if (distSq(p, start) < hRadiusSq) return { drawing: d, handle: 'start' };
                        if (distSq(p, end) < hRadiusSq) return { drawing: d, handle: 'end' };
                        if (distSq(p, c3) < hRadiusSq) return { drawing: d, handle: 'c3' };
                        if (distSq(p, c4) < hRadiusSq) return { drawing: d, handle: 'c4' };

                        const minX = Math.min(start.x, end.x);
                        const maxX = Math.max(start.x, end.x);
                        const minY = Math.min(start.y, end.y);
                        const maxY = Math.max(start.y, end.y);

                        const onEdge =
                            distToSegmentSquared(p, { x: minX, y: minY }, { x: maxX, y: minY }) <
                                HITBOX_WIDTH ** 2 ||
                            distToSegmentSquared(p, { x: minX, y: maxY }, { x: maxX, y: maxY }) <
                                HITBOX_WIDTH ** 2 ||
                            distToSegmentSquared(p, { x: minX, y: minY }, { x: minX, y: maxY }) <
                                HITBOX_WIDTH ** 2 ||
                            distToSegmentSquared(p, { x: maxX, y: minY }, { x: maxX, y: maxY }) <
                                HITBOX_WIDTH ** 2;

                        const isInside = p.x > minX && p.x < maxX && p.y > minY && p.y < maxY;
                        if (onEdge || isInside) return { drawing: d };
                    } else if (
                        d.type === 'Price Range' ||
                        d.type === 'Date Range' ||
                        d.type === 'Date & Price Range' ||
                        d.type === 'Highlight Zone' ||
                        d.type === 'Measure Tool'
                    ) {
                        const minX = Math.min(start.x, end.x);
                        const maxX = Math.max(start.x, end.x);
                        const minY = Math.min(start.y, end.y);
                        const maxY = Math.max(start.y, end.y);

                        // All range tools get 4 corner handles for full-direction editing
                        const hRadiusSq = (HANDLE_RADIUS + 10) ** 2;
                        const c3 = { x: start.x, y: end.y };
                        const c4 = { x: end.x, y: start.y };

                        if (distSq(p, start) < hRadiusSq) return { drawing: d, handle: 'start' };
                        if (distSq(p, end) < hRadiusSq) return { drawing: d, handle: 'end' };
                        if (distSq(p, c3) < hRadiusSq) return { drawing: d, handle: 'c3' };
                        if (distSq(p, c4) < hRadiusSq) return { drawing: d, handle: 'c4' };

                        // Body dragging (anywhere inside or on edges)
                        const isInsideOrOnEdge =
                            p.x >= minX - 8 &&
                            p.x <= maxX + 8 &&
                            p.y >= minY - 8 &&
                            p.y <= maxY + 8;
                        if (isInsideOrOnEdge) return { drawing: d };
                    } else {
                        // Regular 2-point handles
                        if (distSq(p, start) < (HANDLE_RADIUS + 3) ** 2)
                            return { drawing: d, handle: 'start' };
                        if (distSq(p, end) < (HANDLE_RADIUS + 3) ** 2)
                            return { drawing: d, handle: 'end' };
                        // Line-based hit test
                        if (distToSegmentSquared(p, start, end) < HITBOX_WIDTH ** 2)
                            return { drawing: d };
                    }
                }
            } else if (d.type === 'Circle') {
                if (!d.center || !d.edge) continue;
                const cx = timeToX(d.center.time),
                    cy = yScale(d.center.price);
                const ex = timeToX(d.edge.time),
                    ey = yScale(d.edge.price);
                const r = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
                if (distSq(p, { x: cx, y: cy }) < HANDLE_RADIUS ** 2)
                    return { drawing: d, handle: 'center' };
                if (distSq(p, { x: ex, y: ey }) < HANDLE_RADIUS ** 2)
                    return { drawing: d, handle: 'edge' };
                const dist = Math.sqrt(distSq(p, { x: cx, y: cy }));
                if (Math.abs(dist - r) < HITBOX_WIDTH || dist < r) return { drawing: d };
            } else if ((d as any).type === 'Ellipse') {
                const d2 = d as any;
                if (!d2.start || !d2.end) continue;
                const x1 = timeToX(d2.start.time),
                    y1 = yScale(d2.start.price);
                const x2 = timeToX(d2.end.time),
                    y2 = yScale(d2.end.price);
                if (distSq(p, { x: x1, y: y1 }) < HANDLE_RADIUS ** 2)
                    return { drawing: d, handle: 'start' };
                if (distSq(p, { x: x2, y: y2 }) < HANDLE_RADIUS ** 2)
                    return { drawing: d, handle: 'end' };
                const ecx = (x1 + x2) / 2,
                    ecy = (y1 + y2) / 2;
                const erx = Math.abs(x2 - x1) / 2,
                    ery = Math.abs(y2 - y1) / 2;
                if (erx > 0 && ery > 0) {
                    const ev = ((p.x - ecx) / erx) ** 2 + ((p.y - ecy) / ery) ** 2;
                    if (ev <= 1.15) return { drawing: d };
                }
            } else if (d.type === 'Triangle') {
                if (!d.p1 || !d.p2 || !d.p3) continue;
                const t1 = { x: timeToX(d.p1.time), y: yScale(d.p1.price) };
                const t2 = { x: timeToX(d.p2.time), y: yScale(d.p2.price) };
                const t3 = { x: timeToX(d.p3.time), y: yScale(d.p3.price) };
                if (distSq(p, t1) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'p1' };
                if (distSq(p, t2) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'p2' };
                if (distSq(p, t3) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'p3' };
                // Point in triangle test
                const sign = (a: any, b: any, c: any) =>
                    (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);
                const d1 = sign(p, t1, t2),
                    d2 = sign(p, t2, t3),
                    d3 = sign(p, t3, t1);
                const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
                const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
                if (!(hasNeg && hasPos)) return { drawing: d };
                // Edge hit
                if (distToSegmentSquared(p, t1, t2) < HITBOX_WIDTH ** 2) return { drawing: d };
                if (distToSegmentSquared(p, t2, t3) < HITBOX_WIDTH ** 2) return { drawing: d };
                if (distToSegmentSquared(p, t3, t1) < HITBOX_WIDTH ** 2) return { drawing: d };
            } else if ((d as any).type === 'Arc') {
                const da = d as any;
                if (!da.start || !da.end || !da.control) continue;
                const as = { x: timeToX(da.start.time), y: yScale(da.start.price) };
                const ae = { x: timeToX(da.end.time), y: yScale(da.end.price) };
                const ac = { x: timeToX(da.control.time), y: yScale(da.control.price) };
                if (distSq(p, as) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
                if (distSq(p, ae) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'end' };
                if (distSq(p, ac) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'control' };
                // Sample points along the quadratic bezier
                for (let t = 0; t <= 1; t += 0.05) {
                    const bx = (1 - t) * (1 - t) * as.x + 2 * (1 - t) * t * ac.x + t * t * ae.x;
                    const by = (1 - t) * (1 - t) * as.y + 2 * (1 - t) * t * ac.y + t * t * ae.y;
                    if (distSq(p, { x: bx, y: by }) < (HITBOX_WIDTH * 2) ** 2)
                        return { drawing: d };
                }
            } else if (d.type === 'Polygon') {
                if (!d.points || d.points.length < 3) continue;
                const polyPts = d.points.map((pt) => ({
                    x: timeToX(pt.time),
                    y: yScale(pt.price),
                }));
                // Handle check
                for (let pi = 0; pi < polyPts.length; pi++) {
                    if (distSq(p, polyPts[pi]) < HANDLE_RADIUS ** 2)
                        return { drawing: d, handle: `p${pi}` };
                }
                // Point-in-polygon (ray casting)
                let inside = false;
                for (let pi = 0, pj = polyPts.length - 1; pi < polyPts.length; pj = pi++) {
                    const xi = polyPts[pi].x,
                        yi = polyPts[pi].y;
                    const xj = polyPts[pj].x,
                        yj = polyPts[pj].y;
                    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi)
                        inside = !inside;
                }
                if (inside) return { drawing: d };
                // Edge hit
                for (let pi = 0; pi < polyPts.length; pi++) {
                    const pj = (pi + 1) % polyPts.length;
                    if (distToSegmentSquared(p, polyPts[pi], polyPts[pj]) < HITBOX_WIDTH ** 2)
                        return { drawing: d };
                }
            }
        }
        return null;
    };

    // --- ALERT LOGIC ---
    useEffect(() => {
        alertEngine.setDrawings(drawings);
    }, [drawings]);

    useEffect(() => {
        const fetchAlerts = async () => {
            const loadedAlerts = await priceAlertService.getAlerts();
            setAlerts(loadedAlerts);
        };
        fetchAlerts();

        // Subscribe to UI updates (e.g. if side panel deletes an alert)
        const unsubscribe = priceAlertService.subscribe(() => {
            fetchAlerts();
        });
        return unsubscribe;
    }, []);

    // Legacy runAlertEngine effect REMOVED - Logic is now centralized in global AlertEngine.

    const handleAddAlertFromContext = (price: number) => {
        // Create fake drawing for modal context to support simple price alerts
        const fakeDrawing: HorizontalLineDrawing = {
            id: `temp_alert_${Date.now()}`,
            type: 'Horizontal Line',
            price: price,
            style: { color: 'transparent', width: 0, lineStyle: 'solid' },
            isVisible: false,
        };
        setAlertModalInfo({ visible: true, drawing: fakeDrawing });
        setContextMenu(null);
    };

    const handleCreateDrawingAlert = (drawing: Drawing) => {
        // Enforce one alert per drawing limit
        const existingAlert = alerts.find((a) => a.drawingId === drawing.id);
        if (existingAlert) {
            alert(
                'An alert already exists for this drawing. Please delete the existing alert first.'
            );
            return;
        }

        setAlertModalInfo({ visible: true, drawing });
        setContextMenu(null);
    };

    const handleCreateAlertFromModal = (settings: {
        condition: AlertConditionType;
        value?: number;
        fibLevel?: number;
        message: string;
        notifyApp: boolean;
        playSound: boolean;
        triggerFrequency: 'Only Once' | 'Once Per Bar' | 'Once Per Bar Close' | 'Once Per Minute';
        indicatorId?: string;
        alertConditionId?: string;
        conditionParameters?: Record<string, any>;
    }) => {
        if (alertModalInfo.alertToEdit) {
            // Update existing alert
            const updatedAlert: PriceAlert = {
                ...alertModalInfo.alertToEdit,
                condition: settings.condition,
                value: settings.value,
                fibLevel: settings.fibLevel,
                message: settings.message,
                notifyApp: settings.notifyApp,
                playSound: settings.playSound,
                triggerFrequency: settings.triggerFrequency,
                indicatorId: settings.indicatorId,
                alertConditionId: settings.alertConditionId,
                conditionParameters: settings.conditionParameters,
            };
            priceAlertService.updateAlert(updatedAlert.id, updatedAlert);
            setAlerts((prev) => prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)));
        } else {
            // Create new alert
            const newAlert: PriceAlert = {
                id: `alert-${Date.now()}`,
                symbol: symbol,
                drawingId:
                    alertModalInfo.drawing?.id &&
                    !alertModalInfo.drawing.id.startsWith('temp_alert')
                        ? alertModalInfo.drawing.id
                        : undefined,
                condition: settings.condition,
                value: settings.value,
                fibLevel: settings.fibLevel,
                message: settings.message,
                triggered: false,
                createdAt: Date.now(),
                notifyApp: settings.notifyApp,
                playSound: settings.playSound,
                triggerFrequency: settings.triggerFrequency,
                indicatorId: settings.indicatorId,
                alertConditionId: settings.alertConditionId,
                conditionParameters: settings.conditionParameters,
            };
            priceAlertService.saveAlert(newAlert);
            setAlerts((prev) => [...prev, newAlert]);
        }
        setAlertModalInfo({ visible: false, drawing: null, alertToEdit: null });
    };

    const handleEditAlert = (alert: PriceAlert) => {
        const drawing = drawings.find((d) => d.id === alert.drawingId);
        if (drawing) {
            setAlertModalInfo({ visible: true, drawing, alertToEdit: alert });
        }
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        // Disable context menu on X-axis to allow right-click dragging
        if (xAxisContainerRef.current?.contains(e.target as Node)) return;

        if (!chartContainerRef.current) return;

        const chartRect = chartContainerRef.current.getBoundingClientRect();
        const svgX = e.clientX - chartRect.left;
        const svgY = e.clientY - chartRect.top;

        const hit = findDrawingAtPoint(svgX, svgY);

        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            price: yToPrice(svgY),
            time: xToTime(svgX),
            visible: true,
            drawing: hit?.drawing,
        });
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (interaction.type !== 'none' && interaction.type !== 'panning') return;

        const isYAxis = yAxisContainerRef.current?.contains(e.target as Node);

        if (isYAxis) {
            const zoomSensitivity = 0.0006;
            // Standard Y-axis zoom: Scroll Up (negative delta) -> Zoom In (Scale < 1)
            // Scroll Down (positive delta) -> Zoom Out (Scale > 1)
            const scaleFactor = Math.exp(e.deltaY * zoomSensitivity);

            const range = priceRange.max - priceRange.min;
            if (range <= 0) return;

            const newRange = range * scaleFactor;

            if (newRange < 1e-9 || newRange > 1e9) return;

            const center = (priceRange.max + priceRange.min) / 2;

            setPriceRange({
                min: center - newRange / 2,
                max: center + newRange / 2,
            });
            setIsAutoScaling(false);
            return;
        }

        // Analog Navigation Logic:
        // Use Math.exp to create smooth, velocity-sensitive zooming.
        // Scroll Up (negative delta) -> Zoom In (Scale < 1)
        // Scroll Down (positive delta) -> Zoom Out (Scale > 1)

        const zoomSensitivity = 0.0006; // Matches Y-axis sensitivity for consistent feel
        const factor = Math.exp(e.deltaY * zoomSensitivity);

        setView((v) => {
            let newVisible = v.visibleCandles * factor;

            // Pre-clamp newVisible to avoid drift when hitting limits (`getClampedViewState` would do this, but we need the final value for ratios)
            const maxVisible = Math.max(data.length * 1.5, 300);
            newVisible = Math.max(MIN_CANDLES, Math.min(maxVisible, newVisible));

            // Anchor Logic:
            // 1. If Last Candle is visible, LOCK it to its screen position.
            // 2. Fallback to right edge anchoring.

            const lastCandleIndex = data.length - 1;
            const currentRightEdgeIndex = v.startIndex + v.visibleCandles;

            const isLastCandleVisible =
                lastCandleIndex >= v.startIndex && lastCandleIndex <= currentRightEdgeIndex;

            if (isLastCandleVisible && data.length > 0) {
                // Ratio of Last Candle position relative to current view
                // ratio = (Index - Start) / Visible
                // This ratio represents "What % across the screen is the Last Candle?"
                const ratio = (lastCandleIndex - v.startIndex) / v.visibleCandles;

                // To maintain the Lock, the Last Candle must be at the SAME ratio in the NEW view.
                // ratio = (lastCandleIndex - newStartIndex) / newVisible
                // newStartIndex = lastCandleIndex - (ratio * newVisible)
                const newStartIndex = lastCandleIndex - ratio * newVisible;

                return getClampedViewState(newStartIndex, newVisible);
            } else {
                // Fallback: Anchor Right Edge
                const newStartIndex = currentRightEdgeIndex - newVisible;
                return getClampedViewState(newStartIndex, newVisible);
            }
        });
        // Auto-Fit Price Scale:
        // Removed forced `setIsAutoScaling(true)` per user request.
        // If user manually adjusts Y-axis (sets isAutoScaling=false), X-axis zoom should NOT reset it.
        // If isAutoScaling is true, the existing useEffect logic will handle fitting.
    };

    // Toolbar persistence
    const savedToolbarPos = useRef<{ x: number; y: number } | null>(null);

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Try local storage first for speed
                const local = localStorage.getItem('drawingToolbarPos');
                let pos = local ? JSON.parse(local) : null;

                // Validate loaded pos
                if (
                    pos &&
                    (typeof pos.x !== 'number' ||
                        typeof pos.y !== 'number' ||
                        isNaN(pos.x) ||
                        isNaN(pos.y))
                ) {
                    console.warn('Invalid toolbar position in storage, resetting.');
                    pos = null;
                }

                if (pos) savedToolbarPos.current = pos;

                // Fetch from DB
                const settings = await api.getUserSettings();
                if (settings.drawingToolbarPos) {
                    let dbPos = settings.drawingToolbarPos;
                    // Validate DB pos
                    if (
                        dbPos &&
                        (typeof dbPos.x !== 'number' ||
                            typeof dbPos.y !== 'number' ||
                            isNaN(dbPos.x) ||
                            isNaN(dbPos.y))
                    ) {
                        dbPos = null;
                    }

                    if (dbPos) {
                        savedToolbarPos.current = dbPos;
                        localStorage.setItem('drawingToolbarPos', JSON.stringify(dbPos));
                    }
                }
            } catch (e) {
                console.error('Failed to load toolbar settings', e);
            }
        };
        loadSettings();
    }, []);

    const handleDrawingClick = (svgX: number, svgY: number, snappedPoint: Point): boolean => {
        // --- CASE 1: CONTINUE DRAWING (Step 2+) ---
        if (currentDrawing && interaction.type === 'drawing') {
            // Path / Brush Tools
            if (currentDrawing.type === 'Path') {
                setCurrentDrawing((prev) => {
                    if (prev?.type === 'Path') {
                        const newPoints = [...prev.points.slice(0, -1), snappedPoint, snappedPoint];
                        return { ...prev, points: newPoints };
                    }
                    return prev;
                });
                return true;
            }
            // Parallel Channel Steps
            if (currentDrawing.type === 'Parallel Channel') {
                if (currentDrawing.step === 1) {
                    // Step 1: User clicked to confirm End point of Line 1
                    // We transition to Step 2 (setting Offset for Line 2)
                    const { step, ...drawing } = currentDrawing;
                    // Current snappedPoint is the End point of Line 1.
                    // Initialize p2 (offset point) to match snappedPoint initially
                    const updated = { ...drawing, end: snappedPoint, p2: snappedPoint, step: 2 };
                    setCurrentDrawing(updated as any);
                    return true;
                } else if (currentDrawing.step === 2) {
                    // Finishes Step 2 (Width)
                    const { step, ...drawing } = currentDrawing;
                    const finalDrawing = { ...drawing, p2: snappedPoint };
                    commitDrawingChange((prev) => [...prev, finalDrawing]);
                    setCurrentDrawing(null);
                    setActiveTool(null);
                    setInteraction({ type: 'none' });
                    return true;
                }
            }

            // Callout Step 2 (Click to place label)
            if (currentDrawing.type === 'Callout' && currentDrawing.step === 1) {
                const { step, ...drawing } = currentDrawing;
                (drawing as CalloutDrawing).label = snappedPoint;
                commitDrawingChange((prev) => [...prev, drawing as Drawing]);
                setEditingText({
                    drawing: drawing as CalloutDrawing,
                    x: timeToX(drawing.label.time),
                    y: yScale(drawing.label.price),
                });
                setCurrentDrawing(null);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }

            // Triangle: 3 clicks
            if (currentDrawing.type === 'Triangle') {
                if (currentDrawing.step === 1) {
                    setCurrentDrawing((prev) =>
                        prev ? ({ ...prev, p2: snappedPoint, step: 2 } as any) : null
                    );
                    return true;
                } else if (currentDrawing.step === 2) {
                    const { step, ...drawing } = currentDrawing;
                    (drawing as any).p3 = snappedPoint;
                    commitDrawingChange((prev) => [...prev, drawing as Drawing]);
                    setCurrentDrawing(null);
                    setActiveTool(null);
                    setInteraction({ type: 'none' });
                    return true;
                }
            }

            // Arc: step 1 = set end, step 2 = set control point
            if (currentDrawing.type === 'Arc') {
                if (currentDrawing.step === 1) {
                    setCurrentDrawing((prev) =>
                        prev ? ({ ...prev, end: snappedPoint, step: 2 } as any) : null
                    );
                    return true;
                } else if (currentDrawing.step === 2) {
                    const { step, ...drawing } = currentDrawing;
                    (drawing as any).control = snappedPoint;
                    commitDrawingChange((prev) => [...prev, drawing as Drawing]);
                    setCurrentDrawing(null);
                    setActiveTool(null);
                    setInteraction({ type: 'none' });
                    return true;
                }
            }

            // Polygon: click to add points (finalized by double-click)
            if (currentDrawing.type === 'Polygon' && currentDrawing.step === 1) {
                setCurrentDrawing((prev) => {
                    if (prev?.type === 'Polygon') {
                        const pts = [...prev.points.slice(0, -1), snappedPoint, snappedPoint];
                        return { ...prev, points: pts } as any;
                    }
                    return prev;
                });
                return true;
            }

            // 2-Point Tools Step 2 (Click-click method)
            const isTwoPointTool = [
                'Trend Line',
                'Ray',
                'Horizontal Ray',
                'Rectangle',
                'Fibonacci Retracement',
                'Gann Box',
                'Arrow',
                'Price Range',
                'Date Range',
                'Date & Price Range',
                'Highlight Zone',
                'Measure Tool',
                'Callout',
                'Long Position',
                'Short Position',
                'Circle',
                'Ellipse',
            ].includes(currentDrawing.type);
            if (isTwoPointTool) {
                const { step, ...drawing } = currentDrawing as any;
                let finalDrawing;
                if (drawing.type === 'Long Position' || drawing.type === 'Short Position') {
                    // Update profit to final click position
                    const isLng = drawing.type === 'Long Position';
                    const pDiff = snappedPoint.price - drawing.entry.price;
                    const sOff = Math.abs(pDiff) * 0.5;
                    finalDrawing = {
                        ...drawing,
                        profit: { time: snappedPoint.time, price: snappedPoint.price },
                        stop: {
                            time: drawing.entry.time,
                            price: isLng ? drawing.entry.price - sOff : drawing.entry.price + sOff,
                        },
                    };
                } else {
                    finalDrawing = { ...drawing, end: snappedPoint };
                }
                commitDrawingChange((prev) => [...prev, finalDrawing as Drawing]);
                setCurrentDrawing(null);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            return false;
        }

        // --- CASE 2: START NEW DRAWING ---
        if (activeTool) {
            commitCurrentState();
            setInteraction({ type: 'drawing', tool: activeTool });
            const defaultStyle: DrawingStyle = {
                color: '#c4b5f0',
                width: 2,
                lineStyle: 'solid',
                fillColor: 'rgba(196, 181, 240, 0.15)',
            };
            const id = `d${Date.now()}`;

            // Handle Instant Tools
            if (activeTool === 'Horizontal Line') {
                const hl: HorizontalLineDrawing = {
                    id,
                    type: activeTool,
                    price: snappedPoint.price,
                    style: defaultStyle,
                    isVisible: true,
                };
                commitDrawingChange((prev) => [...prev, hl]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Vertical Line') {
                const vl: VerticalLineDrawing = {
                    id,
                    type: activeTool,
                    time: snappedPoint.time,
                    style: defaultStyle,
                    isVisible: true,
                };
                commitDrawingChange((prev) => [...prev, vl]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Text Note') {
                const textNote: TextNoteDrawing = {
                    id,
                    type: activeTool,
                    point: snappedPoint,
                    text: 'Note...',
                    style: { ...defaultStyle, fontSize: 14 },
                    isVisible: true,
                };
                commitDrawingChange((prev) => [...prev, textNote]);
                setEditingText({
                    drawing: textNote,
                    x: timeToX(snappedPoint.time),
                    y: yScale(snappedPoint.price),
                });
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }

            // Single-click placement tools
            if (activeTool === 'Price Label') {
                const priceStr =
                    snappedPoint.price >= 1000
                        ? snappedPoint.price.toFixed(2)
                        : snappedPoint.price.toFixed(4);
                commitDrawingChange((prev) => [
                    ...prev,
                    {
                        id,
                        type: 'Price Label',
                        point: snappedPoint,
                        text: priceStr,
                        style: defaultStyle,
                        isVisible: true,
                    } as any,
                ]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Signal Marker') {
                commitDrawingChange((prev) => [
                    ...prev,
                    {
                        id,
                        type: 'Signal Marker',
                        point: snappedPoint,
                        signal: 'buy',
                        style: defaultStyle,
                        isVisible: true,
                    } as any,
                ]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Note Flag') {
                const nfDrawing = {
                    id,
                    type: 'Note Flag',
                    point: snappedPoint,
                    text: 'Flag',
                    style: defaultStyle,
                    isVisible: true,
                } as any;
                commitDrawingChange((prev) => [...prev, nfDrawing]);
                setEditingText({
                    drawing: nfDrawing,
                    x: timeToX(snappedPoint.time),
                    y: yScale(snappedPoint.price),
                });
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Emoji Sticker') {
                const emojis = ['🎯', '🚀', '⚠️', '💰', '📌', '🔥', '✅', '❌'];
                const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                commitDrawingChange((prev) => [
                    ...prev,
                    {
                        id,
                        type: 'Emoji Sticker',
                        point: snappedPoint,
                        emoji,
                        style: defaultStyle,
                        isVisible: true,
                    } as any,
                ]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }

            // Handle Multi-Step Tools initialization
            let newDrawing: CurrentDrawing | null = null;
            switch (activeTool) {
                case 'Trend Line':
                case 'Ray':
                case 'Horizontal Ray':
                case 'Rectangle':
                case 'Fibonacci Retracement':
                case 'Gann Box':
                case 'Arrow':
                case 'Price Range':
                case 'Date Range':
                case 'Date & Price Range':
                case 'Highlight Zone':
                case 'Measure Tool':
                    newDrawing = {
                        id,
                        type: activeTool,
                        start: snappedPoint,
                        end: snappedPoint,
                        text: activeTool === 'Highlight Zone' ? '' : undefined,
                        style: defaultStyle,
                        step: 1,
                    } as any;
                    break;
                case 'Long Position':
                case 'Short Position': {
                    const isLong = activeTool === 'Long Position';
                    const entryPrice = snappedPoint.price;
                    const offset = entryPrice * 0.02;
                    newDrawing = {
                        id,
                        type: activeTool,
                        entry: snappedPoint,
                        profit: {
                            time: snappedPoint.time,
                            price: isLong ? entryPrice + offset : entryPrice - offset,
                        },
                        stop: {
                            time: snappedPoint.time,
                            price: isLong ? entryPrice - offset * 0.5 : entryPrice + offset * 0.5,
                        },
                        style: defaultStyle,
                        step: 1,
                    };
                    break;
                }
                case 'Parallel Channel':
                    newDrawing = {
                        id,
                        type: activeTool,
                        start: snappedPoint,
                        end: snappedPoint,
                        p2: snappedPoint,
                        step: 1,
                        style: { ...defaultStyle, fillColor: 'rgba(196, 181, 240, 0.15)' },
                    };
                    break;
                case 'Path':
                    newDrawing = {
                        id,
                        type: 'Path',
                        points: [snappedPoint, snappedPoint],
                        style: defaultStyle,
                        isVisible: true,
                    };
                    break;
                case 'Brush':
                    newDrawing = {
                        id,
                        type: 'Brush',
                        points: [{ time: xToTimeFractional(svgX), price: yToPrice(svgY) }],
                        style: defaultStyle,
                        isVisible: true,
                    };
                    break;
                case 'Callout':
                    newDrawing = {
                        id,
                        type: 'Callout',
                        anchor: snappedPoint,
                        label: snappedPoint,
                        text: 'Note...',
                        step: 1,
                        style: defaultStyle,
                        isVisible: true,
                    };
                    break;
                case 'Circle':
                    newDrawing = {
                        id,
                        type: 'Circle',
                        center: snappedPoint,
                        edge: snappedPoint,
                        style: { ...defaultStyle, fillColor: 'rgba(196,181,240,0.12)' },
                        isVisible: true,
                    };
                    break;
                case 'Ellipse':
                    newDrawing = {
                        id,
                        type: 'Ellipse',
                        start: snappedPoint,
                        end: snappedPoint,
                        style: { ...defaultStyle, fillColor: 'rgba(196,181,240,0.12)' },
                        isVisible: true,
                    };
                    break;
                case 'Triangle':
                    newDrawing = {
                        id,
                        type: 'Triangle',
                        p1: snappedPoint,
                        p2: snappedPoint,
                        p3: snappedPoint,
                        step: 1,
                        style: { ...defaultStyle, fillColor: 'rgba(196,181,240,0.12)' },
                        isVisible: true,
                    };
                    break;
                case 'Arc':
                    newDrawing = {
                        id,
                        type: 'Arc',
                        start: snappedPoint,
                        end: snappedPoint,
                        control: { time: snappedPoint.time, price: snappedPoint.price },
                        step: 1,
                        style: defaultStyle,
                        isVisible: true,
                    };
                    break;
                case 'Polygon':
                    newDrawing = {
                        id,
                        type: 'Polygon',
                        points: [snappedPoint, snappedPoint],
                        step: 1,
                        style: { ...defaultStyle, fillColor: 'rgba(196,181,240,0.12)' },
                        isVisible: true,
                    };
                    break;
            }
            setCurrentDrawing(newDrawing);
            return true;
        }

        // --- CASE 3: INTERACT WITH EXISTING ---
        const hit = findDrawingAtPoint(svgX, svgY);
        if (hit) {
            setSelectedDrawingId(hit.drawing.id);
            // Use saved position if available, otherwise default to click position
            // We use savedToolbarPos.current which is initialized eagerly
            if (!savedToolbarPos.current || typeof savedToolbarPos.current.x !== 'number') {
                // Try to re-read if null (state might be stale closure but ref should be fine)
                try {
                    const saved = localStorage.getItem('drawingToolbarPos');
                    if (saved) savedToolbarPos.current = JSON.parse(saved);
                } catch (e) {
                    console.warn('Failed to restore toolbar position:', e);
                }
            }

            setFloatingToolbarPos(
                savedToolbarPos.current ? savedToolbarPos.current : { x: svgX, y: svgY }
            );

            if (hit.handle) {
                setInteraction({
                    type: 'resizing',
                    drawingId: hit.drawing.id,
                    handle: hit.handle,
                    initialDrawing: hit.drawing,
                    startMousePos: { x: svgX, y: svgY },
                    startPoint: snappedPoint,
                });
            } else {
                setInteraction({
                    type: 'moving',
                    drawingId: hit.drawing.id,
                    initialDrawing: hit.drawing,
                    startMousePos: { x: svgX, y: svgY },
                    startPoint: snappedPoint,
                });
            }
            commitCurrentState();
            return true;
        } else {
            setSelectedDrawingId(null);
        }
        return false;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Stop if clicking UI controls
        if (
            (e.target as HTMLElement).closest(
                'button, input, select, textarea, [data-context-menu]'
            )
        )
            return;
        if (!eventContainerRef.current || !chartContainerRef.current) return;
        eventContainerRef.current.focus();

        // Capture pointer and track it
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        tapDetectionRef.current = {
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
            wasVisible: tooltip.visible,
        };

        const chartRect = chartContainerRef.current.getBoundingClientRect();
        const isTouch = e.pointerType === 'touch';
        const touchYOffset = isTouch ? 70 : 0;
        const svgX = e.clientX - chartRect.left;
        const svgY = e.clientY - chartRect.top - touchYOffset;

        // Always show crosshair immediately on touch
        if (xStep > 0) {
            const indexInViewFloat = view.startIndex + svgX / xStep - 0.5;
            const dataIndex = Math.round(indexInViewFloat);
            const candleData = dataIndex >= 0 && dataIndex < data.length ? data[dataIndex] : null;
            setTooltip((prev) => ({
                visible: true,
                x: candleData ? indexToX(dataIndex - view.startIndex) : svgX,
                y: svgY,
                data: candleData,
            }));
        } else {
            setTooltip((prev) => ({ visible: true, x: svgX, y: svgY, data: null }));
        }

        // Multi-touch Pinch Check
        if (activePointers.current.size === 2) {
            const points = Array.from(activePointers.current.values()) as {
                x: number;
                y: number;
            }[];
            const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

            const centerX = (points[0].x + points[1].x) / 2 - chartRect.left;

            // Calculate anchor point in data coordinates
            const candlesPerPixel = view.visibleCandles / chartDimensions.width;
            const initialCenterIndex = view.startIndex + centerX * candlesPerPixel;

            const centerY = (points[0].y + points[1].y) / 2 - chartRect.top;
            const initialCenterPrice = yToPrice(centerY);

            setInteraction({
                type: 'pinching',
                initialDistance: dist,
                initialVisibleCandles: view.visibleCandles,
                initialStartIndex: view.startIndex,
                initialPriceRange: priceRange,
                initialCenterIndex: initialCenterIndex,
                initialCenterPrice: initialCenterPrice,
            });
            setIsAutoScaling(false);
            return;
        }

        // Ignore if more than 2 touches
        if (activePointers.current.size > 2) return;

        const isXAxis = xAxisContainerRef.current?.contains(e.target as Node);

        if (contextMenu?.visible) setContextMenu(null);

        // Allow right click (button 2) only if it's on XAxis
        if (e.button === 2 && !isXAxis) return;

        const { point: snappedPoint } = getSnappedPoint(svgX, svgY);

        // Only process drawing interactions with Left Click
        if (e.button === 0) {
            // Special "Place on Lift" logic for Touch Devices
            if (e.pointerType === 'touch' && (activeTool || currentDrawing)) {
                isAimingRef.current = true;
                return; // Skip execution, wait for PointerUp
            }

            // Clear any existing timer
            if (longPressTimer.current) clearTimeout(longPressTimer.current);

            // Long press detection for crosshair inspection on mobile
            if (isTouch && !activeTool && !currentDrawing) {
                longPressTimer.current = setTimeout(() => {
                    setInteraction({ type: 'crosshair' });
                    if (navigator.vibrate) navigator.vibrate(50); // Feedback
                }, 500); // 500ms for long press
            }

            const handled = handleDrawingClick(svgX, svgY, snappedPoint);

            // If handleDrawingClick started an interaction, return
            if (handled || interaction.type !== 'none' || activeTool || currentDrawing) return;
        }

        // --- CASE 4: NAVIGATION ---
        const isYAxis = yAxisContainerRef.current?.contains(e.target as Node);

        if (isYAxis) {
            if (e.button !== 0) return; // Only left click for Y axis scaling
            setInteraction({
                type: 'scaling',
                area: 'yAxis',
                startX: e.clientX,
                startY: e.clientY,
                initialPriceRange: priceRange,
                initialStartIndex: view.startIndex,
                initialVisibleCandles: view.visibleCandles,
            });
            setIsAutoScaling(false);
        } else if (isXAxis) {
            if (e.button !== 0) return;

            setInteraction({
                type: 'scaling',
                area: 'xAxis',
                startX: e.clientX,
                startY: e.clientY,
                initialVisibleCandles: view.visibleCandles,
                initialStartIndex: view.startIndex,
                initialPriceRange: priceRange,
            });
        } else {
            if (e.button !== 0) return; // Only left click for panning chart area
            // Only start panning if NOT aiming tool
            if (!activeTool && !currentDrawing) {
                if (isMobile && tooltip.visible) {
                    setInteraction({ type: 'crosshair' });
                } else {
                    setInteraction({
                        type: 'panning',
                        area: 'chart',
                        startX: e.clientX,
                        startY: e.clientY,
                        initialStartIndex: view.startIndex,
                        initialVisibleCandles: view.visibleCandles,
                        initialPriceRange: priceRange,
                    });
                    setIsAutoScaling(false);
                }
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!eventContainerRef.current || !chartContainerRef.current) return;

        // Update active pointers map
        if (activePointers.current.has(e.pointerId)) {
            activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }

        // Pinch Zoom Logic
        if (interaction.type === 'pinching' && activePointers.current.size === 2) {
            const points = Array.from(activePointers.current.values()) as {
                x: number;
                y: number;
            }[];
            const newDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

            if (newDist < 5) return; // Ignore tiny movements

            const scale = interaction.initialDistance / newDist;
            const newVisibleCandles = interaction.initialVisibleCandles * scale;

            const rect = chartContainerRef.current.getBoundingClientRect();
            const currentCenterX = (points[0].x + points[1].x) / 2 - rect.left;

            // Anchor logic: keep the center index at the relative screen position
            const newStartIndex =
                interaction.initialCenterIndex -
                currentCenterX * (newVisibleCandles / chartDimensions.width);

            setView(getClampedViewState(newStartIndex, newVisibleCandles));
            return;
        }

        const chartRect = chartContainerRef.current.getBoundingClientRect();
        const isTouch = e.pointerType === 'touch';
        const touchYOffset = isTouch ? 70 : 0;
        const svgX = e.clientX - chartRect.left;
        const svgY = e.clientY - chartRect.top - touchYOffset;

        // Always update tooltip/crosshair regardless of interaction state
        setTooltip((prev) => ({ ...prev, visible: true, x: svgX, y: svgY }));
        if (xStep > 0) {
            const indexInViewFloat = view.startIndex + svgX / xStep - 0.5;
            const dataIndex = Math.round(indexInViewFloat);
            const candleData = dataIndex >= 0 && dataIndex < data.length ? data[dataIndex] : null;
            if (candleData) {
                setHeaderOhlc(candleData);
                // Snap crosshair X if over a candle
                setTooltip((prev) => ({
                    ...prev,
                    data: candleData,
                    x: indexToX(dataIndex - view.startIndex),
                }));
            }
        }

        const { point: snappedPoint, indicator: snapIndicatorValue } = getSnappedPoint(svgX, svgY);
        setSnapIndicator(snapIndicatorValue);

        const currentInteractionType = currentDrawing ? 'drawing' : interaction.type;

        // Handle touch aiming visual feedback (rubber banding)
        if (isAimingRef.current && currentDrawing) {
            // Force update drawing geometry even if interaction type is 'none'
            const updatedDrawing = { ...currentDrawing };
            switch (updatedDrawing.type) {
                case 'Trend Line':
                case 'Ray':
                case 'Horizontal Ray':
                case 'Rectangle':
                case 'Fibonacci Retracement':
                case 'Gann Box':
                case 'Arrow':
                case 'Price Range':
                case 'Date Range':
                case 'Date & Price Range':
                case 'Highlight Zone':
                case 'Measure Tool':
                    (updatedDrawing as any).end = snappedPoint;
                    break;
                case 'Parallel Channel':
                    if (updatedDrawing.step === 1) {
                        (updatedDrawing as any).end = snappedPoint;
                        (updatedDrawing as any).p2 = snappedPoint;
                    } else if (updatedDrawing.step === 2) {
                        (updatedDrawing as any).p2 = snappedPoint;
                    }
                    break;
                case 'Path':
                    const path = updatedDrawing as PathDrawing;
                    const newPoints = [...path.points];
                    newPoints[newPoints.length - 1] = snappedPoint;
                    (updatedDrawing as any).points = newPoints;
                    break;
                case 'Long Position':
                case 'Short Position': {
                    const pos = updatedDrawing as any;
                    const isLng = pos.type === 'Long Position';
                    const pDiff = snappedPoint.price - pos.entry.price;
                    pos.profit = { time: snappedPoint.time, price: snappedPoint.price };
                    const sOff = Math.abs(pDiff) * 0.5;
                    pos.stop = {
                        time: pos.entry.time,
                        price: isLng ? pos.entry.price - sOff : pos.entry.price + sOff,
                    };
                    break;
                }
                case 'Callout':
                    if (updatedDrawing.step === 1) {
                        (updatedDrawing as any).label = snappedPoint;
                    }
                    break;
                case 'Circle':
                    (updatedDrawing as any).edge = snappedPoint;
                    break;
                case 'Ellipse':
                    (updatedDrawing as any).end = snappedPoint;
                    break;
                case 'Triangle':
                    if (updatedDrawing.step === 1) {
                        (updatedDrawing as any).p2 = snappedPoint;
                    } else if (updatedDrawing.step === 2) {
                        (updatedDrawing as any).p3 = snappedPoint;
                    }
                    break;
                case 'Arc':
                    if (updatedDrawing.step === 1) {
                        (updatedDrawing as any).end = snappedPoint;
                    } else if (updatedDrawing.step === 2) {
                        (updatedDrawing as any).control = snappedPoint;
                    }
                    break;
                case 'Polygon':
                    if (updatedDrawing.step === 1) {
                        const polyPts = [...(updatedDrawing as any).points];
                        polyPts[polyPts.length - 1] = snappedPoint;
                        (updatedDrawing as any).points = polyPts;
                    }
                    break;
            }
            setCurrentDrawing(updatedDrawing);
        }

        // Cancel long press if movement is significant
        if (longPressTimer.current && interaction.type === 'panning') {
            const dx = e.clientX - interaction.startX;
            const dy = e.clientY - interaction.startY;
            if (Math.hypot(dx, dy) > 20) {
                // Increased from 10
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }

        switch (currentInteractionType) {
            case 'panning':
                if (interaction.type === 'panning') {
                    const dx = e.clientX - interaction.startX;
                    if (xStep > 0) {
                        const candlesMoved = dx / xStep;
                        setView(
                            getClampedViewState(
                                interaction.initialStartIndex - candlesMoved,
                                view.visibleCandles
                            )
                        );
                    }
                    if (interaction.area === 'chart') {
                        const dy = e.clientY - interaction.startY;
                        const priceRangeValue =
                            interaction.initialPriceRange.max - interaction.initialPriceRange.min;
                        if (priceRangeValue > 0 && chartDimensions.height > 0) {
                            const priceDelta = (dy / chartDimensions.height) * priceRangeValue;
                            setPriceRange({
                                min: interaction.initialPriceRange.min + priceDelta,
                                max: interaction.initialPriceRange.max + priceDelta,
                            });
                        }
                    }
                }
                break;
            case 'crosshair':
                // In crosshair mode, we just let the tooltip update above (which happens for every move)
                // and skip any panning/zooming logic.
                break;
            case 'drawing':
                if (currentDrawing) {
                    const updatedDrawing = { ...currentDrawing };
                    switch (updatedDrawing.type) {
                        case 'Trend Line':
                        case 'Ray':
                        case 'Horizontal Ray':
                        case 'Rectangle':
                        case 'Fibonacci Retracement':
                        case 'Gann Box':
                        case 'Arrow':
                        case 'Price Range':
                        case 'Date Range':
                        case 'Date & Price Range':
                            (updatedDrawing as any).end = snappedPoint;
                            break;
                        case 'Long Position':
                        case 'Short Position': {
                            const pos = updatedDrawing as any;
                            const isLong = pos.type === 'Long Position';
                            const priceDiff = snappedPoint.price - pos.entry.price;
                            // Update on both step 1 (drag-to-draw) and step 2 (click-click)
                            pos.profit = { time: snappedPoint.time, price: snappedPoint.price };
                            const stopOffset = Math.abs(priceDiff) * 0.5;
                            pos.stop = {
                                time: pos.entry.time,
                                price: isLong
                                    ? pos.entry.price - stopOffset
                                    : pos.entry.price + stopOffset,
                            };
                            break;
                        }
                        case 'Parallel Channel':
                            if (updatedDrawing.step === 1) {
                                (updatedDrawing as any).end = snappedPoint;
                                // In Step 1, p2 (width point) should track exactly with end or stay at start?
                                // Let's keep p2 at end so the width is zero initially.
                                (updatedDrawing as any).p2 = snappedPoint;
                            } else if (updatedDrawing.step === 2) {
                                // In Step 2, Start and End are fixed. P2 (width) follows mouse.
                                (updatedDrawing as any).p2 = snappedPoint;
                            }
                            break;
                        case 'Path':
                            const path = updatedDrawing as PathDrawing;
                            // Update the last "ghost" point
                            const newPoints = [...path.points];
                            newPoints[newPoints.length - 1] = snappedPoint;
                            (updatedDrawing as any).points = newPoints;
                            break;
                        case 'Brush': {
                            // Use fractional time for smooth freehand drawing (no candle snapping)
                            const rawPoint = {
                                time: xToTimeFractional(svgX),
                                price: yToPrice(svgY),
                            };
                            const brushPoints = (updatedDrawing as any).points;
                            const lastBrushPt = brushPoints[brushPoints.length - 1];
                            const lastBX = timeToX(lastBrushPt.time);
                            const lastBY = yScale(lastBrushPt.price);

                            // Only add if moved > 1 pixel for maximum smoothness
                            if (Math.hypot(svgX - lastBX, svgY - lastBY) > 1) {
                                (updatedDrawing as any).points = [...brushPoints, rawPoint];
                            }
                            break;
                        }
                        case 'Callout':
                            if (updatedDrawing.step === 1) {
                                (updatedDrawing as any).label = snappedPoint;
                            }
                            break;
                        case 'Circle':
                            (updatedDrawing as any).edge = snappedPoint;
                            break;
                        case 'Ellipse':
                            (updatedDrawing as any).end = snappedPoint;
                            break;
                        case 'Triangle':
                            if (updatedDrawing.step === 1)
                                (updatedDrawing as any).p2 = snappedPoint;
                            else if (updatedDrawing.step === 2)
                                (updatedDrawing as any).p3 = snappedPoint;
                            break;
                        case 'Arc':
                            if (updatedDrawing.step === 1)
                                (updatedDrawing as any).end = snappedPoint;
                            else if (updatedDrawing.step === 2)
                                (updatedDrawing as any).control = snappedPoint;
                            break;
                        case 'Polygon':
                            if (updatedDrawing.step === 1) {
                                const pPts = [...(updatedDrawing as any).points];
                                pPts[pPts.length - 1] = snappedPoint;
                                (updatedDrawing as any).points = pPts;
                            }
                            break;
                    }
                    setCurrentDrawing(updatedDrawing);
                }
                break;
            case 'moving': {
                if (interaction.type === 'moving') {
                    let moved = JSON.parse(JSON.stringify(interaction.initialDrawing)); // Deep copy

                    // For Brush, move the entire array of points
                    if (
                        interaction.initialDrawing.type === 'Brush' ||
                        interaction.initialDrawing.type === 'Path'
                    ) {
                        const dxTime = snappedPoint.time - interaction.startPoint.time;
                        const dyPrice = snappedPoint.price - interaction.startPoint.price;

                        const initialPts = (interaction.initialDrawing as PathDrawing).points;
                        const newPoints = initialPts.map((p) => ({
                            time: p.time + dxTime,
                            price: p.price + dyPrice,
                        }));
                        moved = { ...moved, points: newPoints };
                    } else {
                        const dxTime = snappedPoint.time - interaction.startPoint.time;
                        const dyPrice = snappedPoint.price - interaction.startPoint.price;
                        if ('start' in moved)
                            moved.start = {
                                time: moved.start.time + dxTime,
                                price: moved.start.price + dyPrice,
                            };
                        if ('end' in moved)
                            moved.end = {
                                time: moved.end.time + dxTime,
                                price: moved.end.price + dyPrice,
                            };
                        if ('point' in moved)
                            moved.point = {
                                time: moved.point.time + dxTime,
                                price: moved.point.price + dyPrice,
                            };
                        if ('price' in moved) moved.price += dyPrice;
                        if ('p2' in moved)
                            moved.p2 = {
                                time: moved.p2.time + dxTime,
                                price: moved.p2.price + dyPrice,
                            };
                        if ('anchor' in moved)
                            moved.anchor = {
                                time: moved.anchor.time + dxTime,
                                price: moved.anchor.price + dyPrice,
                            };
                        if ('label' in moved)
                            moved.label = {
                                time: moved.label.time + dxTime,
                                price: moved.label.price + dyPrice,
                            };
                        if ('entry' in moved)
                            moved.entry = {
                                time: moved.entry.time + dxTime,
                                price: moved.entry.price + dyPrice,
                            };
                        if ('stop' in moved)
                            moved.stop = {
                                time: moved.stop.time + dxTime,
                                price: moved.stop.price + dyPrice,
                            };
                        if ('profit' in moved)
                            moved.profit = {
                                time: moved.profit.time + dxTime,
                                price: moved.profit.price + dyPrice,
                            };
                    }
                    setDrawings((prev) =>
                        prev.map((d) => (d.id === interaction.drawingId ? moved : d))
                    );
                }
                break;
            }
            case 'resizing': {
                if (interaction.type === 'resizing') {
                    const resized = { ...interaction.initialDrawing } as any;
                    const h = interaction.handle;

                    // Long/Short Position handles — unique names, checked BEFORE generic
                    if (resized.type === 'Long Position' || resized.type === 'Short Position') {
                        const isLong = resized.type === 'Long Position';
                        if (h === 'tp') {
                            // TP: move profit price, clamped at entry (stays at boundary)
                            const entryP = resized.entry.price;
                            const clampedTP = isLong
                                ? Math.max(snappedPoint.price, entryP)
                                : Math.min(snappedPoint.price, entryP);
                            resized.profit = { ...resized.profit, price: clampedTP };
                        } else if (h === 'sl') {
                            // SL: move stop price, clamped at entry (stays at boundary)
                            const entryP = resized.entry.price;
                            const clampedSL = isLong
                                ? Math.min(snappedPoint.price, entryP)
                                : Math.max(snappedPoint.price, entryP);
                            resized.stop = { ...resized.stop, price: clampedSL };
                        } else if (h === 'entryBand') {
                            // Entry band: vertical only, clamped between TP and SL
                            const profitP = resized.profit.price;
                            const stopP = resized.stop.price;
                            const clampedENT = isLong
                                ? Math.min(Math.max(snappedPoint.price, stopP), profitP)
                                : Math.max(Math.min(snappedPoint.price, stopP), profitP);
                            resized.entry = { ...resized.entry, price: clampedENT };
                        } else if (h === 'entryLeft' || h === 'entryRight') {
                            // Left ENT: vertical + horizontal. Right ENT: horizontal only.
                            if (h === 'entryLeft') {
                                const profitP = resized.profit.price;
                                const stopP = resized.stop.price;
                                const clampedENT = isLong
                                    ? Math.min(Math.max(snappedPoint.price, stopP), profitP)
                                    : Math.max(Math.min(snappedPoint.price, stopP), profitP);
                                resized.entry = { ...resized.entry, price: clampedENT };
                            }
                            // Horizontal: move the edge this pill sits on
                            const initPos = interaction.initialDrawing as any;
                            const timeDelta = snappedPoint.time - interaction.startPoint.time;
                            const initEntryX = timeToX(initPos.entry.time);
                            const initProfitX = timeToX(initPos.profit.time);
                            if (h === 'entryLeft') {
                                // Move left edge, clamp at right edge
                                if (initEntryX <= initProfitX) {
                                    const newTime = Math.min(
                                        initPos.entry.time + timeDelta,
                                        initPos.profit.time
                                    );
                                    const clampedDelta = newTime - initPos.entry.time;
                                    resized.entry = { ...resized.entry, time: newTime };
                                    resized.stop = {
                                        ...resized.stop,
                                        time: initPos.stop.time + clampedDelta,
                                    };
                                } else {
                                    const newTime = Math.min(
                                        initPos.profit.time + timeDelta,
                                        initPos.entry.time
                                    );
                                    resized.profit = { ...resized.profit, time: newTime };
                                }
                            } else {
                                // Move right edge, clamp at left edge
                                if (initEntryX >= initProfitX) {
                                    const newTime = Math.max(
                                        initPos.entry.time + timeDelta,
                                        initPos.profit.time
                                    );
                                    const clampedDelta = newTime - initPos.entry.time;
                                    resized.entry = { ...resized.entry, time: newTime };
                                    resized.stop = {
                                        ...resized.stop,
                                        time: initPos.stop.time + clampedDelta,
                                    };
                                } else {
                                    const newTime = Math.max(
                                        initPos.profit.time + timeDelta,
                                        initPos.entry.time
                                    );
                                    resized.profit = { ...resized.profit, time: newTime };
                                }
                            }
                        }
                    } else if (h === 'start' || h === 'end') {
                        // All range tools: update full point (both time + price)
                        if (h === 'start') resized.start = snappedPoint;
                        else resized.end = snappedPoint;
                    } else if (h === 'c3') {
                        resized.start = { ...resized.start, time: snappedPoint.time };
                        resized.end = { ...resized.end, price: snappedPoint.price };
                    } else if (h === 'c4') {
                        resized.end = { ...resized.end, time: snappedPoint.time };
                        resized.start = { ...resized.start, price: snappedPoint.price };
                    } else if (typeof h === 'string' && h.startsWith('p')) {
                        const idx = parseInt(h.substring(1));
                        if (!isNaN(idx) && resized.type === 'Path') {
                            const newPoints = [...resized.points];
                            newPoints[idx] = snappedPoint;
                            resized.points = newPoints;
                        }
                    } else if (h === 'body') {
                        resized.price = snappedPoint.price;
                    } else if (h === 'p2') resized.p2 = snappedPoint;
                    else if (h === 'p2_end') {
                        // Modifying Line 2 End
                        // We need to calculate where p2 (Line 2 Start) should be so that Line 2 passes through snappedPoint
                        // New P2 = SnappedPoint - Vector(Line 1)
                        // Vector(Line 1) = End - Start
                        const dxTime = resized.end.time - resized.start.time;
                        const dyPrice = resized.end.price - resized.start.price;
                        resized.p2 = {
                            time: snappedPoint.time - dxTime,
                            price: snappedPoint.price - dyPrice,
                        };
                    } else if (h === 'anchor') resized.anchor = snappedPoint;
                    else if (h === 'label') resized.label = snappedPoint;
                    else if (h === 'entry') resized.entry = snappedPoint;
                    else if (h === 'profit')
                        resized.profit = { time: snappedPoint.time, price: snappedPoint.price };
                    else if (h === 'stop')
                        resized.stop = { time: snappedPoint.time, price: snappedPoint.price };

                    setDrawings((prev) =>
                        prev.map((d) => (d.id === interaction.drawingId ? resized : d))
                    );
                }
                break;
            }
            case 'scaling':
                if (interaction.type === 'scaling' && interaction.area === 'yAxis') {
                    const dy = e.clientY - interaction.startY;
                    const scaleFactor = 1 + dy * 0.003;
                    const range =
                        interaction.initialPriceRange.max - interaction.initialPriceRange.min;
                    const center =
                        (interaction.initialPriceRange.max + interaction.initialPriceRange.min) / 2;
                    const newRange = range * scaleFactor;
                    if (newRange > 0.000001) {
                        setPriceRange({ min: center - newRange / 2, max: center + newRange / 2 });
                    }
                } else if (interaction.type === 'scaling' && interaction.area === 'xAxis') {
                    const dx = e.clientX - interaction.startX;
                    const zoomSensitivity = 0.005;
                    const scaleFactor = Math.exp(dx * zoomSensitivity);

                    const newVisibleCandles = interaction.initialVisibleCandles * scaleFactor;
                    const initialRightIndex =
                        interaction.initialStartIndex + interaction.initialVisibleCandles;
                    const newStartIndex = initialRightIndex - newVisibleCandles;

                    setView(getClampedViewState(newStartIndex, newVisibleCandles));
                }
                break;
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);

        // Commit Movement/Zoom state if changed
        if (
            interaction.type === 'panning' ||
            (interaction.type === 'scaling' && interaction.area === 'xAxis')
        ) {
            const hasChanged =
                Math.abs(view.startIndex - interaction.initialStartIndex) > 0.001 ||
                Math.abs(view.visibleCandles - interaction.initialVisibleCandles) > 0.001;

            if (hasChanged) {
                // Reconstruct the state BEFORE the interaction using the initial view data preserved in 'interaction'
                const stateBeforeDrag: HistoryState = {
                    drawings: JSON.parse(JSON.stringify(drawings)),
                    indicators: JSON.parse(JSON.stringify(allActiveIndicators)),
                    view: {
                        startIndex: interaction.initialStartIndex,
                        visibleCandles: interaction.initialVisibleCandles,
                    },
                    priceRange: priceRange ? { ...priceRange } : null,
                    isAutoScaling,
                    chartType,
                };
                setUndoStack((prev) => [...prev.slice(-49), stateBeforeDrag]);
                setRedoStack([]);
            }
        }

        activePointers.current.delete(e.pointerId);

        // Clear long press timer
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        // Exit crosshair mode on release
        if (interaction.type === 'crosshair') {
            setInteraction({ type: 'none' });
            // Don't return here, let cleanup run, but skip drawing/moving commits since type is none/crosshair
        }

        if (interaction.type === 'pinching') {
            if (activePointers.current.size < 2) {
                setInteraction({ type: 'none' });
            }
            return;
        }

        // Handle deferred drawing logic for touch aiming
        if (isAimingRef.current) {
            if (!chartContainerRef.current) return;
            const chartRect = chartContainerRef.current.getBoundingClientRect();
            const svgX = e.clientX - chartRect.left;
            const svgY = e.clientY - chartRect.top;
            const { point: snappedPoint } = getSnappedPoint(svgX, svgY);

            handleDrawingClick(svgX, svgY, snappedPoint);
            isAimingRef.current = false;
            // Don't return, let cleanup logic run
        }

        if (interaction.type === 'moving' || interaction.type === 'resizing') {
            commitDrawingChange((prev) => prev);
            setInteraction({ type: 'none' });
            return;
        }

        if (currentDrawing) {
            if (currentDrawing.type === 'Brush') {
                // Apply Ramer-Douglas-Peucker simplification on finish
                const rawPoints = (currentDrawing as BrushDrawing).points;
                // Convert to screen pixels for simplification
                const screenPoints = rawPoints.map((p) => ({
                    x: timeToX(p.time),
                    y: yScale(p.price),
                }));

                // RDP Algorithm
                const rdpCheck = (
                    pts: typeof screenPoints,
                    epsilon: number
                ): typeof screenPoints => {
                    if (pts.length < 3) return pts;
                    let dmax = 0;
                    let index = 0;
                    const end = pts.length - 1;
                    for (let i = 1; i < end; i++) {
                        const d = perpendicularDistanceSquared(pts[i], pts[0], pts[end]);
                        if (d > dmax) {
                            index = i;
                            dmax = d;
                        }
                    }
                    if (dmax > epsilon * epsilon) {
                        const res1 = rdpCheck(pts.slice(0, index + 1), epsilon);
                        const res2 = rdpCheck(pts.slice(index), epsilon);
                        return [...res1.slice(0, -1), ...res2];
                    } else {
                        return [pts[0], pts[end]];
                    }
                };

                // Use epsilon of 2.0 pixels for gentle simplification
                const simplifiedScreenPoints = rdpCheck(screenPoints, 2.0);

                // Map back to Time/Price (approximate, or just map indices if we preserved them?
                // RDP destroys indices. We need to map back from screen pixels to Time/Price.)
                // Since our transform is linear/log, we can invert it.
                const simplifiedDataPoints = simplifiedScreenPoints.map((sp) => ({
                    time: xToTime(sp.x),
                    price: yToPrice(sp.y),
                }));

                const finalBrush = { ...currentDrawing, points: simplifiedDataPoints };

                commitDrawingChange((prev) => [...prev, finalBrush as Drawing]);
                setCurrentDrawing(null);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return;
            }

            if (interaction.type === 'drawing') {
                // Check for "Drag-to-Draw" completion
                const isTwoPointTool = [
                    'Trend Line',
                    'Ray',
                    'Horizontal Ray',
                    'Rectangle',
                    'Arrow',
                    'Price Range',
                    'Date Range',
                    'Date & Price Range',
                    'Highlight Zone',
                    'Measure Tool',
                    'Fibonacci Retracement',
                    'Gann Box',
                    'Callout',
                    'Long Position',
                    'Short Position',
                ].includes(currentDrawing.type);

                let hasDragged = false;
                if (isTwoPointTool) {
                    const d = currentDrawing as any;
                    // Basic drag detection (if start and end are different enough)
                    // Check for undefined to avoid crashes with Callout vs others
                    if (d.type === 'Callout') {
                        if (d.anchor && d.label) {
                            hasDragged =
                                Math.abs(d.anchor.time - d.label.time) > 0 ||
                                Math.abs(d.anchor.price - d.label.price) > 0;
                        }
                    } else if (d.type === 'Long Position' || d.type === 'Short Position') {
                        if (d.entry && d.profit) {
                            hasDragged =
                                Math.abs(d.entry.price - d.profit.price) > d.entry.price * 0.001;
                        }
                    } else {
                        if (d.start && d.end) {
                            hasDragged =
                                Math.abs(d.start.time - d.end.time) > 0 ||
                                Math.abs(d.start.price - d.end.price) > 0;
                        }
                    }
                }

                if (isTwoPointTool && hasDragged) {
                    // FINISH: Drag-and-Release
                    const { step, ...drawing } = currentDrawing;
                    commitDrawingChange((prev) => [...prev, drawing as Drawing]);
                    if (currentDrawing.type === 'Callout') {
                        const d = drawing as CalloutDrawing;
                        setEditingText({
                            drawing: d,
                            x: timeToX(d.label.time),
                            y: yScale(d.label.price),
                        });
                    }
                    setCurrentDrawing(null);
                    setActiveTool(null);
                    setInteraction({ type: 'none' });
                } else if (currentDrawing.step === 1) {
                    // ADVANCE: Click-Click method
                    // For Parallel Channel, do NOT advance on mouse up if we haven't dragged.
                    // We want the user to Click (Start) -> Release -> Move -> Click (End).
                    // If we advance here on simple release, we skip the move phase.
                    if (currentDrawing.type === 'Parallel Channel') {
                        // Only advance if dragged (drag-to-draw style for first segment)
                        const d = currentDrawing as any;
                        const dist = Math.hypot(
                            d.start.time - d.end.time,
                            d.start.price - d.end.price
                        );
                        // Note: time/price are different units, but direct comparison tells us if they are identical
                        if (d.start.time !== d.end.time || d.start.price !== d.end.price) {
                            // Dragged significant amount
                            setCurrentDrawing((prev) =>
                                prev ? ({ ...prev, step: 2 } as CurrentDrawingState) : null
                            );
                        }
                        // Else: Do nothing, stay in Step 1 (Waiting for End point click)
                    } else if (
                        currentDrawing.type === 'Callout' ||
                        currentDrawing.type === 'Triangle' ||
                        currentDrawing.type === 'Arc' ||
                        currentDrawing.type === 'Polygon'
                    ) {
                        // Multi-step tools: stay in step 1 on mouseUp without drag
                        // Points follow mouse, next click advances/finalizes
                    } else {
                        setCurrentDrawing((prev) =>
                            prev ? ({ ...prev, step: 2 } as CurrentDrawingState) : null
                        );
                    }
                } else if (
                    currentDrawing.step === 2 &&
                    currentDrawing.type === 'Parallel Channel'
                ) {
                    // ADVANCE: Channel needs 3 clicks
                    // Do nothing on pointer up, wait for click 3 (handled in pointer down) or drag finish?
                }
            }
        }

        // Toggle crosshair visibility on single tap (Mobile)
        if (
            isMobile &&
            tapDetectionRef.current &&
            (interaction.type === 'panning' || interaction.type === 'crosshair')
        ) {
            const { x, y, time, wasVisible } = tapDetectionRef.current;
            const dist = Math.hypot(e.clientX - x, e.clientY - y);
            const elapsed = Date.now() - time;
            if (dist < 10 && elapsed < 300) {
                if (wasVisible) {
                    setTooltip((prev) => ({ ...prev, visible: false }));
                }
            }
        }
        tapDetectionRef.current = null;

        if (
            interaction.type === 'panning' ||
            interaction.type === 'scaling' ||
            interaction.type === 'dragging_position_line'
        ) {
            setInteraction({ type: 'none' });
        }
    };

    const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
        if (activePointers.current.has(e.pointerId)) {
            activePointers.current.delete(e.pointerId);
            if (interaction.type === 'pinching' && activePointers.current.size < 2) {
                setInteraction({ type: 'none' });
            }
        }

        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        if (!isMobile) {
            setTooltip({ visible: false, x: 0, y: 0, data: null });
            setSnapIndicator(null);
        }
        isAimingRef.current = false;

        if (
            interaction.type !== 'none' &&
            interaction.type !== 'drawing' &&
            interaction.type !== 'pinching'
        ) {
            setInteraction({ type: 'none' });
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        const isYAxis = yAxisContainerRef.current?.contains(e.target as Node);
        if (isYAxis) {
            setIsAutoScaling(true);
        }
        if (!chartContainerRef.current) return;
        const chartRect = chartContainerRef.current.getBoundingClientRect();
        const svgX = e.clientX - chartRect.left;
        const svgY = e.clientY - chartRect.top;
        const hit = findDrawingAtPoint(svgX, svgY);

        if (hit && hit.drawing.type === 'Text Note') {
            setSelectedDrawingId(hit.drawing.id);
            const textX = timeToX(hit.drawing.point.time);
            const textY = yScale(hit.drawing.point.price);
            setEditingText({ drawing: hit.drawing, x: textX, y: textY });
            setTimeout(() => textInputRef.current?.focus(), 0);
        } else if (hit && hit.drawing.type === 'Callout') {
            setSelectedDrawingId(hit.drawing.id);
            const coLX = timeToX(hit.drawing.label.time);
            const coLY = yScale(hit.drawing.label.price);
            // x,y = top-left of the bubble (label point is top-left)
            setEditingText({ drawing: hit.drawing as CalloutDrawing, x: coLX, y: coLY });
            setTimeout(() => textInputRef.current?.focus(), 0);
        } else if (currentDrawing?.type === 'Path' || currentDrawing?.type === 'Polygon') {
            // Finalize Path/Polygon drawing on double click
            const { step, ...drawing } = currentDrawing;
            const finalDrawing = { ...drawing, points: (drawing as any).points.slice(0, -1) };
            commitDrawingChange((prev) => [...prev, finalDrawing as Drawing]);
            setCurrentDrawing(null);
            setActiveTool(null);
            setInteraction({ type: 'none' });
        }
    };

    const handleCopyChart = async () => {
        if (chartCanvasRef.current) {
            chartCanvasRef.current.toBlob((blob) => {
                if (blob) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    alert('Chart copied to clipboard!');
                }
            });
        }
    };
    const onLockVerticalLine = (time: number) => {
        setLockedVerticalLineTime((prev) => (prev === time ? null : time));
    };

    const handleExecuteOrder = async (side: TradeDirection, orderType: string) => {
        const latestPrice = data.length > 0 ? data[data.length - 1].close : 0;
        const newPos: Omit<Position, 'id'> = {
            symbol: props.symbol,
            account: assetType,
            direction: side,
            quantity: parseFloat(order.quantity),
            entryPrice: orderType === 'Market' ? latestPrice : parseFloat(order.price),
            stopLoss: parseFloat(order.sl),
            takeProfit: parseFloat(order.tp),
            status: orderType === 'Market' ? PositionStatus.OPEN : PositionStatus.PENDING,
            openTime: new Date().toISOString(),
            pnl: 0,
        };
        await api.createPosition(newPos);
    };
    const handleModifyPosition = async (id: string, vals: { sl: number; tp: number }) => {
        await api.updatePosition(id, vals);
    };
    const handleClosePosition = async (id: string) => {
        await api.closePosition(id, headerOhlc?.close || 0);
    };
    const handleCancelOrder = async (id: string) => {
        await api.cancelPosition(id);
    };
    const handleReversePosition = async (id: string) => {
        await api.reversePosition(id, headerOhlc?.close || 0);
    };

    const handleToolAction = (action: string) => {
        switch (action) {
            case 'draw':
                setMobileDrawingModalOpen(true);
                break;
            case 'indicators':
                setIndicatorPanelOpen(true);
                break;
            case 'watchlist':
                setRightPanel('watchlist');
                break;
            case 'more':
                setMobileMoreMenuOpen(true);
                break;
        }
    };

    const renderDrawingsAndOverlays = () => {
        const drawingsToRender = [...drawings, currentDrawing].filter(
            (d) => d && d.isVisible !== false
        ) as (Drawing | CurrentDrawing)[];

        const renderHandle = (cx: number, cy: number, cursor: string = 'move') => (
            <g key={`h-${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r={HANDLE_RADIUS + 3} fill="transparent" cursor={cursor} />
                <circle
                    cx={cx}
                    cy={cy}
                    r={HANDLE_RADIUS}
                    fill="#1f1f1f"
                    stroke="#c4b5f0"
                    strokeWidth="2"
                    className="pointer-events-none"
                />
            </g>
        );

        const getSmoothPath = (points: { x: number; y: number }[]) => {
            if (points.length < 2) return '';
            if (points.length === 2)
                return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

            // Quadratic Bezier through midpoints for smooth freehand curves
            let d = `M ${points[0].x} ${points[0].y}`;

            // Line to midpoint of first segment
            const mid0 = {
                x: (points[0].x + points[1].x) / 2,
                y: (points[0].y + points[1].y) / 2,
            };
            d += ` L ${mid0.x} ${mid0.y}`;

            // Quadratic curves using each point as control, midpoints as endpoints
            for (let i = 1; i < points.length - 1; i++) {
                const mid = {
                    x: (points[i].x + points[i + 1].x) / 2,
                    y: (points[i].y + points[i + 1].y) / 2,
                };
                d += ` Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`;
            }

            // Line to last point
            const last = points[points.length - 1];
            d += ` L ${last.x} ${last.y}`;

            return d;
        };

        return (
            <>
                {drawingsToRender.map((d) => {
                    const isSelected = selectedDrawingId === d.id;
                    const key = d.id;
                    let style = d.style;

                    if (currentDrawing && d.id === currentDrawing.id) {
                        style = {
                            ...d.style,
                            color: '#c4b5f0',
                            width: Math.max(d.style.width, 2),
                        };
                    }

                    const strokeDasharray =
                        style.lineStyle === 'dashed'
                            ? '8 4'
                            : style.lineStyle === 'dotted'
                              ? '2 6'
                              : undefined;

                    switch (d.type) {
                        case 'Trend Line':
                        case 'Ray': {
                            if (!d.start || !d.end) return null;
                            const startX = timeToX(d.start.time),
                                startY = yScale(d.start.price);
                            const endX = timeToX(d.end.time),
                                endY = yScale(d.end.price);
                            let targetX = endX,
                                targetY = endY;
                            if (d.type === 'Ray') {
                                const dx = endX - startX,
                                    dy = endY - startY;
                                if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
                                    const len = Math.sqrt(dx * dx + dy * dy);
                                    const extension =
                                        chartDimensions.width + chartDimensions.height;
                                    targetX = startX + (dx / len) * extension;
                                    targetY = startY + (dy / len) * extension;
                                }
                            }

                            let infoBox = null;
                            if (
                                currentDrawing &&
                                d.id === currentDrawing.id &&
                                d.start.time !== d.end.time
                            ) {
                                const priceDelta = d.end.price - d.start.price;
                                const pricePercent =
                                    d.start.price !== 0 ? (priceDelta / d.start.price) * 100 : 0;
                                const timeDelta = d.end.time - d.start.time;
                                const barDelta = Math.round(timeDelta / candleInterval);
                                const angle =
                                    Math.atan2(-(endY - startY), endX - startX) * (180 / Math.PI);

                                const infoText = [
                                    `${priceDelta.toFixed(5)} (${pricePercent.toFixed(2)}%)`,
                                    `${barDelta} bars`,
                                    `${angle.toFixed(1)}°`,
                                ];

                                const textWidth = 120,
                                    textHeight = 60;
                                let boxX = (startX + endX) / 2 + 15;
                                let boxY = (startY + endY) / 2 - textHeight / 2;
                                if (boxX + textWidth > chartDimensions.width)
                                    boxX = (startX + endX) / 2 - textWidth - 15;
                                boxY = Math.max(
                                    5,
                                    Math.min(boxY, chartDimensions.height - textHeight - 5)
                                );

                                infoBox = (
                                    <g
                                        transform={`translate(${boxX}, ${boxY})`}
                                        className="pointer-events-none"
                                    >
                                        <rect
                                            width={textWidth}
                                            height={textHeight}
                                            rx="4"
                                            fill="rgba(31, 41, 55, 0.8)"
                                            stroke="#60A5FA"
                                            strokeWidth="1"
                                        />
                                        {infoText.map((text, i) => (
                                            <text
                                                key={i}
                                                x="10"
                                                y={20 + i * 16}
                                                fill="#E5E7EB"
                                                fontSize="11"
                                            >
                                                {text}
                                            </text>
                                        ))}
                                    </g>
                                );
                            }

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <line
                                        x1={startX}
                                        y1={startY}
                                        x2={targetX}
                                        y2={targetY}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        cursor="move"
                                    />
                                    <line
                                        x1={startX}
                                        y1={startY}
                                        x2={targetX}
                                        y2={targetY}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        strokeLinecap="round"
                                    />
                                    {isSelected && (
                                        <>
                                            {renderHandle(startX, startY)}
                                            {renderHandle(endX, endY)}
                                        </>
                                    )}
                                    {infoBox}
                                </g>
                            );
                        }
                        case 'Horizontal Line': {
                            const y = yScale(d.price);
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <line
                                        x1="0"
                                        y1={y}
                                        x2={chartDimensions.width}
                                        y2={y}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        cursor="ns-resize"
                                    />
                                    <line
                                        x1="0"
                                        y1={y}
                                        x2={chartDimensions.width}
                                        y2={y}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                    />
                                </g>
                            );
                        }
                        case 'Horizontal Ray': {
                            if (!d.start) return null;
                            const startX = timeToX(d.start.time),
                                y = yScale(d.start.price);
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <line
                                        x1={startX}
                                        y1={y}
                                        x2={chartDimensions.width}
                                        y2={y}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        cursor="move"
                                    />
                                    <line
                                        x1={startX}
                                        y1={y}
                                        x2={chartDimensions.width}
                                        y2={y}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                    />
                                    {isSelected && renderHandle(startX, y)}
                                </g>
                            );
                        }
                        case 'Rectangle': {
                            if (!d.start || !d.end) return null;
                            const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                            const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];
                            const x = Math.min(x1, x2),
                                y = Math.min(y1, y2),
                                w = Math.abs(x1 - x2),
                                h = Math.abs(y1 - y2);
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <rect
                                        x={x}
                                        y={y}
                                        width={w}
                                        height={h}
                                        fill={style.fillColor || 'transparent'}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        cursor="move"
                                    />
                                    {isSelected &&
                                        (() => {
                                            const nx1 = timeToX(d.start.time),
                                                ny1 = yScale(d.start.price);
                                            const nx2 = timeToX(d.end.time),
                                                ny2 = yScale(d.end.price);
                                            const nwse =
                                                (nx1 < nx2 && ny1 < ny2) || (nx1 > nx2 && ny1 > ny2)
                                                    ? 'nwse-resize'
                                                    : 'nesw-resize';
                                            const nesw =
                                                nwse === 'nwse-resize'
                                                    ? 'nesw-resize'
                                                    : 'nwse-resize';
                                            return (
                                                <>
                                                    {renderHandle(nx1, ny1, nwse)}
                                                    {renderHandle(nx2, ny2, nwse)}
                                                    {renderHandle(nx1, ny2, nesw)}
                                                    {renderHandle(nx2, ny1, nesw)}
                                                </>
                                            );
                                        })()}
                                </g>
                            );
                        }
                        case 'Fibonacci Retracement': {
                            if (!d.start || !d.end) return null;
                            const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                            const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];
                            const priceDiff = d.end.price - d.start.price;

                            // Default Settings fallback
                            const settings = d.style.fibSettings || {
                                trendLine: {
                                    visible: true,
                                    color: style.color,
                                    width: 1,
                                    style: 'dashed',
                                },
                                levels: FIB_LEVELS.map((l, i) => ({
                                    level: l,
                                    color: FIB_LEVEL_COLORS[i] || style.color,
                                    visible: true,
                                })),
                                extendLines: false,
                                showBackground: true,
                                backgroundTransparency: 0.85,
                                useLogScale: false,
                            };

                            const x_min = Math.min(x1, x2);
                            const x_max = Math.max(x1, x2);
                            const width = x_max - x_min;

                            // Filter visible levels and sort
                            const activeLevels = settings.levels
                                .filter((l) => l.visible)
                                .sort((a, b) => a.level - b.level);
                            const opacity =
                                1 - Math.max(0, Math.min(1, settings.backgroundTransparency));

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    {/* Background Fills */}
                                    {settings.showBackground &&
                                        activeLevels.slice(0, -1).map((l, i) => {
                                            const next = activeLevels[i + 1];
                                            const y_start = yScale(
                                                d.start.price + priceDiff * l.level
                                            );
                                            const y_end = yScale(
                                                d.start.price + priceDiff * next.level
                                            );
                                            const h = Math.abs(y_start - y_end);
                                            const y = Math.min(y_start, y_end);
                                            // Use color of the *current* level for the band (standard TradingView behavior) or mix?
                                            // TradingView uses the color of the level.
                                            return (
                                                <rect
                                                    key={`fill-${i}`}
                                                    x={settings.extendLines ? 0 : x_min}
                                                    y={y}
                                                    width={
                                                        settings.extendLines
                                                            ? chartDimensions.width
                                                            : width
                                                    }
                                                    height={h}
                                                    fill={l.color}
                                                    fillOpacity={opacity * 0.5}
                                                />
                                            );
                                        })}

                                    {/* Trend Line */}
                                    {settings.trendLine.visible && (
                                        <line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke={settings.trendLine.color}
                                            strokeWidth={settings.trendLine.width}
                                            strokeDasharray={
                                                settings.trendLine.style === 'dashed'
                                                    ? '4 4'
                                                    : settings.trendLine.style === 'dotted'
                                                      ? '1 4'
                                                      : undefined
                                            }
                                        />
                                    )}

                                    {/* Grid Lines & Labels */}
                                    {activeLevels.map((l, i) => {
                                        const price = d.start.price + priceDiff * l.level;
                                        const y = yScale(price);
                                        const textX = settings.extendLines
                                            ? d.start.time < d.end.time
                                                ? chartDimensions.width - 50
                                                : 50 // Simplified
                                            : d.start.time < d.end.time
                                              ? x2 + 5
                                              : x2 - 5;
                                        const textAnchor =
                                            d.start.time < d.end.time ? 'start' : 'end';
                                        const label = `${l.level.toFixed(3)} (${formatPrice(price)})`;

                                        return (
                                            <g key={`grid-${i}`}>
                                                <line
                                                    x1={settings.extendLines ? 0 : x_min}
                                                    y1={y}
                                                    x2={
                                                        settings.extendLines
                                                            ? chartDimensions.width
                                                            : x_max
                                                    }
                                                    y2={y}
                                                    stroke={l.color}
                                                    strokeWidth={style.width}
                                                />
                                                <text
                                                    x={textX}
                                                    y={y - 4}
                                                    fill={l.color}
                                                    fontSize="10"
                                                    textAnchor={textAnchor}
                                                    className="pointer-events-none"
                                                >
                                                    {label}
                                                </text>
                                            </g>
                                        );
                                    })}

                                    {isSelected &&
                                        (() => {
                                            const nwse =
                                                (x1 < x2 && y1 < y2) || (x1 > x2 && y1 > y2)
                                                    ? 'nwse-resize'
                                                    : 'nesw-resize';
                                            const nesw =
                                                nwse === 'nwse-resize'
                                                    ? 'nesw-resize'
                                                    : 'nwse-resize';
                                            return (
                                                <>
                                                    {renderHandle(x1, y1, nwse)}
                                                    {renderHandle(x2, y2, nwse)}
                                                    {renderHandle(x1, y2, nesw)}
                                                    {renderHandle(x2, y1, nesw)}
                                                </>
                                            );
                                        })()}
                                </g>
                            );
                        }
                        case 'Gann Box': {
                            if (!d.start || !d.end) return null;
                            const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                            const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];

                            // Use bounding box for consistent 0-1 regardless of draw direction
                            const x = Math.min(x1, x2),
                                y = Math.min(y1, y2);
                            const w = Math.abs(x1 - x2),
                                h = Math.abs(y1 - y2);

                            // Resolve Settings
                            const settings = d.style.gannSettings || {
                                priceLevels: GANN_LEVELS.map((l, i) => ({
                                    level: l,
                                    color: GANN_LEVEL_COLORS[i] || d.style.color,
                                    visible: true,
                                })),
                                timeLevels: GANN_LEVELS.map((l, i) => ({
                                    level: l,
                                    color: GANN_LEVEL_COLORS[i] || d.style.color,
                                    visible: true,
                                })),
                                useLeftLabels: true,
                                useRightLabels: true,
                                useTopLabels: true,
                                useBottomLabels: true,
                                showBackground: true,
                                backgroundTransparency: 0.9,
                            };

                            const activeTimeLevels = settings.timeLevels
                                .filter((l) => l.visible)
                                .sort((a, b) => a.level - b.level);
                            const activePriceLevels = settings.priceLevels
                                .filter((l) => l.visible)
                                .sort((a, b) => a.level - b.level);

                            const opacity =
                                1 - Math.max(0, Math.min(1, settings.backgroundTransparency));

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    {/* Background Fills - Intersecting Strips */}
                                    {settings.showBackground && (
                                        <>
                                            {/* Time Strips */}
                                            {activeTimeLevels.slice(0, -1).map((l, i) => {
                                                const next = activeTimeLevels[i + 1];
                                                const vx = x + w * l.level;
                                                const vw = w * (next.level - l.level);
                                                if (vw <= 0) return null;
                                                return (
                                                    <rect
                                                        key={`t-fill-${i}`}
                                                        x={vx}
                                                        y={y}
                                                        width={vw}
                                                        height={h}
                                                        fill={l.color}
                                                        fillOpacity={opacity * 0.5}
                                                    />
                                                );
                                            })}
                                            {/* Price Strips */}
                                            {activePriceLevels.slice(0, -1).map((l, i) => {
                                                const next = activePriceLevels[i + 1];
                                                const hy = y + h * l.level;
                                                const hh = h * (next.level - l.level);
                                                if (hh <= 0) return null;
                                                return (
                                                    <rect
                                                        key={`p-fill-${i}`}
                                                        x={x}
                                                        y={hy}
                                                        width={w}
                                                        height={hh}
                                                        fill={l.color}
                                                        fillOpacity={opacity * 0.5}
                                                    />
                                                );
                                            })}
                                        </>
                                    )}

                                    {/* Grid Lines & Labels */}
                                    {/* Time Levels (Vertical) */}
                                    {activeTimeLevels.map((l, i) => {
                                        const lx = x + w * l.level;
                                        return (
                                            <g key={`t-grid-${i}`}>
                                                <line
                                                    x1={lx}
                                                    y1={y}
                                                    x2={lx}
                                                    y2={y + h}
                                                    stroke={l.color}
                                                    strokeWidth={1}
                                                    strokeOpacity={0.8}
                                                />
                                                {settings.useTopLabels &&
                                                    l.level >= 0 &&
                                                    l.level <= 1 && (
                                                        <text
                                                            x={lx}
                                                            y={y - 5}
                                                            fill={l.color}
                                                            fontSize={10}
                                                            textAnchor="middle"
                                                        >
                                                            {l.level}
                                                        </text>
                                                    )}
                                                {settings.useBottomLabels &&
                                                    l.level >= 0 &&
                                                    l.level <= 1 && (
                                                        <text
                                                            x={lx}
                                                            y={y + h + 12}
                                                            fill={l.color}
                                                            fontSize={10}
                                                            textAnchor="middle"
                                                        >
                                                            {l.level}
                                                        </text>
                                                    )}
                                            </g>
                                        );
                                    })}

                                    {/* Price Levels (Horizontal) */}
                                    {activePriceLevels.map((l, i) => {
                                        const ly = y + h * l.level;
                                        return (
                                            <g key={`p-grid-${i}`}>
                                                <line
                                                    x1={x}
                                                    y1={ly}
                                                    x2={x + w}
                                                    y2={ly}
                                                    stroke={l.color}
                                                    strokeWidth={1}
                                                    strokeOpacity={0.8}
                                                />
                                                {settings.useRightLabels &&
                                                    l.level >= 0 &&
                                                    l.level <= 1 && (
                                                        <text
                                                            x={x + w + 5}
                                                            y={ly + 3}
                                                            fill={l.color}
                                                            fontSize={10}
                                                            textAnchor="start"
                                                        >
                                                            {l.level}
                                                        </text>
                                                    )}
                                                {settings.useLeftLabels &&
                                                    l.level >= 0 &&
                                                    l.level <= 1 && (
                                                        <text
                                                            x={x - 5}
                                                            y={ly + 3}
                                                            fill={l.color}
                                                            fontSize={10}
                                                            textAnchor="end"
                                                        >
                                                            {l.level}
                                                        </text>
                                                    )}
                                            </g>
                                        );
                                    })}

                                    {/* Outer Border */}
                                    <rect
                                        x={x}
                                        y={y}
                                        width={w}
                                        height={h}
                                        fill="none"
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                    />
                                    {isSelected &&
                                        (() => {
                                            const nx1 = timeToX(d.start.time),
                                                ny1 = yScale(d.start.price);
                                            const nx2 = timeToX(d.end.time),
                                                ny2 = yScale(d.end.price);
                                            const nwse =
                                                (nx1 < nx2 && ny1 < ny2) || (nx1 > nx2 && ny1 > ny2)
                                                    ? 'nwse-resize'
                                                    : 'nesw-resize';
                                            const nesw =
                                                nwse === 'nwse-resize'
                                                    ? 'nesw-resize'
                                                    : 'nwse-resize';
                                            return (
                                                <>
                                                    {renderHandle(nx1, ny1, nwse)}
                                                    {renderHandle(nx2, ny2, nwse)}
                                                    {renderHandle(nx1, ny2, nesw)}
                                                    {renderHandle(nx2, ny1, nesw)}
                                                </>
                                            );
                                        })()}
                                </g>
                            );
                        }
                        case 'Parallel Channel': {
                            if (!d.start || !d.end || !d.p2) return null;
                            const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                            const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];
                            const [xp2, yp2] = [timeToX(d.p2.time), yScale(d.p2.price)];

                            // Outer-Lines Model:
                            // Line 1: P1 -> P2 (Start -> End)
                            // Line 2: Parallel to Line 1, passing through P3 (p2)

                            // Vector for Line 1
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            // const len = Math.sqrt(dx * dx + dy * dy);

                            // Line 2 Points
                            // P3 (xp2, yp2) is an anchor on Line 2
                            // Line 2 "Start" and "End" can be projected relative to Line 1
                            // L2_Start = P3
                            // L2_End = P3 + Vector(1->2)
                            // This makes Line 2 have same length and slope as Line 1

                            const l2_x1 = xp2;
                            const l2_y1 = yp2;
                            const l2_x2 = xp2 + dx;
                            const l2_y2 = yp2 + dy;

                            // Center Line (Average of L1 and L2)
                            const c_x1 = (x1 + l2_x1) / 2;
                            const c_y1 = (y1 + l2_y1) / 2;
                            const c_x2 = (x2 + l2_x2) / 2;
                            const c_y2 = (y2 + l2_y2) / 2;

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    {/* Fill Area with Polygon */}
                                    <polygon
                                        points={`${x1},${y1} ${x2},${y2} ${l2_x2},${l2_y2} ${l2_x1},${l2_y1}`}
                                        fill={style.fillColor || 'rgba(196, 181, 240, 0.15)'}
                                        stroke="none"
                                    />

                                    {/* Line 1 (Defined by Start/End) */}
                                    <line
                                        x1={x1}
                                        y1={y1}
                                        x2={x2}
                                        y2={y2}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                    />

                                    {/* Line 2 (Defined by P2 + Vector) */}
                                    <line
                                        x1={l2_x1}
                                        y1={l2_y1}
                                        x2={l2_x2}
                                        y2={l2_y2}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                    />

                                    {/* Centerline (Average) */}
                                    <line
                                        x1={c_x1}
                                        y1={c_y1}
                                        x2={c_x2}
                                        y2={c_y2}
                                        stroke={style.color}
                                        strokeWidth={1}
                                        strokeDasharray="6 4"
                                        strokeOpacity="0.8"
                                    />

                                    {isSelected && (
                                        <>
                                            {renderHandle(x1, y1)}
                                            {renderHandle(x2, y2)}
                                            {renderHandle(l2_x1, l2_y1, 'move')}
                                            {renderHandle(l2_x2, l2_y2, 'move')}
                                        </>
                                    )}
                                </g>
                            );
                        }

                        case 'Text Note': {
                            if (editingText?.drawing.id === d.id) return null;
                            if (!d.point) return null;
                            const tnX = timeToX(d.point.time);
                            const tnY = yScale(d.point.price);
                            const tnFont = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const tnSize = style.fontSize || 13;
                            const tnPad = 10;
                            const tnLines = d.text.split('\n');
                            const tnMaxLine = Math.max(...tnLines.map((l) => l.length), 4);
                            const tnW = Math.max(tnMaxLine * (tnSize * 0.58) + tnPad * 2 + 6, 60);
                            const tnLineH = tnSize * 1.5;
                            const tnH = tnLines.length * tnLineH + tnPad * 2 + 4;
                            const tnCardX = tnX + 10;
                            const tnCardY = tnY - tnH;

                            return (
                                <g
                                    key={key}
                                    cursor="move"
                                    pointerEvents="auto"
                                    shapeRendering="crispEdges"
                                >
                                    {/* Pin marker */}
                                    <circle
                                        cx={tnX}
                                        cy={tnY}
                                        r={4}
                                        fill="#c4b5f0"
                                        shapeRendering="geometricPrecision"
                                    />
                                    <line
                                        x1={tnX}
                                        y1={tnY - 4}
                                        x2={tnX}
                                        y2={tnCardY + tnH}
                                        stroke="#c4b5f0"
                                        strokeWidth={1}
                                    />

                                    {/* Card */}
                                    <rect
                                        x={tnCardX}
                                        y={tnCardY}
                                        width={tnW}
                                        height={tnH}
                                        rx={6}
                                        fill="#1e1b2e"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        shapeRendering="geometricPrecision"
                                    />
                                    {/* Accent bar */}
                                    <rect
                                        x={tnCardX}
                                        y={tnCardY}
                                        width={3}
                                        height={tnH}
                                        rx={1.5}
                                        fill="#c4b5f0"
                                        shapeRendering="geometricPrecision"
                                    />

                                    {tnLines.map((line, li) => (
                                        <text
                                            key={li}
                                            x={tnCardX + 12}
                                            y={tnCardY + tnPad + tnSize - 2 + li * tnLineH}
                                            fill="#eae6f4"
                                            fontSize={tnSize}
                                            fontWeight={600}
                                            fontFamily={tnFont}
                                            className="pointer-events-none"
                                            textRendering="optimizeLegibility"
                                        >
                                            {line}
                                        </text>
                                    ))}

                                    {/* Handle */}
                                    {isSelected && (
                                        <circle
                                            cx={tnX}
                                            cy={tnY}
                                            r={5}
                                            fill="#131722"
                                            stroke="#c4b5f0"
                                            strokeWidth={2}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                </g>
                            );
                        }
                        case 'Vertical Line': {
                            const x = timeToX(d.time);
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <line
                                        x1={x}
                                        y1={0}
                                        x2={x}
                                        y2={chartDimensions.height}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        cursor="ew-resize"
                                    />
                                    <line
                                        x1={x}
                                        y1={0}
                                        x2={x}
                                        y2={chartDimensions.height}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                    />
                                </g>
                            );
                        }
                        case 'Arrow': {
                            if (!d.start || !d.end) return null;
                            const [startX, startY] = [timeToX(d.start.time), yScale(d.start.price)];
                            const [endX, endY] = [timeToX(d.end.time), yScale(d.end.price)];
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <defs>
                                        <marker
                                            id={`arrowhead-${d.id}`}
                                            viewBox="0 0 10 10"
                                            refX="8"
                                            refY="5"
                                            markerWidth="6"
                                            markerHeight="6"
                                            orient="auto-start-reverse"
                                        >
                                            <path d="M 0 0 L 10 5 L 0 10 z" fill={style.color} />
                                        </marker>
                                    </defs>
                                    <line
                                        x1={startX}
                                        y1={startY}
                                        x2={endX}
                                        y2={endY}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        cursor="move"
                                    />
                                    <line
                                        x1={startX}
                                        y1={startY}
                                        x2={endX}
                                        y2={endY}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        markerEnd={`url(#arrowhead-${d.id})`}
                                    />
                                    {isSelected && (
                                        <>
                                            {renderHandle(startX, startY)}{' '}
                                            {renderHandle(endX, endY)}
                                        </>
                                    )}
                                </g>
                            );
                        }
                        case 'Path': {
                            const points = d.points.map((p) => ({
                                x: timeToX(p.time),
                                y: yScale(p.price),
                            }));
                            const pathData = points
                                .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
                                .join(' ');

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <path
                                        d={pathData}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        fill="none"
                                        cursor="move"
                                    />
                                    <path
                                        d={pathData}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        fill="none"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                    {isSelected &&
                                        d.points.map((p, i) => {
                                            const x = timeToX(p.time);
                                            const y = yScale(p.price);
                                            return <g key={`handle-${i}`}>{renderHandle(x, y)}</g>;
                                        })}
                                </g>
                            );
                        }
                        case 'Brush': {
                            const points = d.points.map((p) => ({
                                x: timeToX(p.time),
                                y: yScale(p.price),
                            }));
                            const smoothPath = getSmoothPath(points);

                            // Calculate bounding box for single handle/selection visual
                            const xs = points.map((p) => p.x);
                            const ys = points.map((p) => p.y);
                            const minX = Math.min(...xs),
                                maxX = Math.max(...xs);
                            const minY = Math.min(...ys),
                                maxY = Math.max(...ys);

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <path
                                        d={smoothPath}
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        fill="none"
                                        cursor="move"
                                    />
                                    <path
                                        d={smoothPath}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        fill="none"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                    {isSelected && (
                                        <rect
                                            x={minX - 5}
                                            y={minY - 5}
                                            width={maxX - minX + 10}
                                            height={maxY - minY + 10}
                                            fill="transparent"
                                            stroke={style.color}
                                            strokeWidth={1}
                                            strokeDasharray="4 4"
                                            className="pointer-events-none"
                                        />
                                    )}
                                </g>
                            );
                        }
                        case 'Callout': {
                            if (editingText?.drawing.id === d.id) return null;
                            if (!d.anchor || !d.label) return null;
                            const [coAX, coAY] = [timeToX(d.anchor.time), yScale(d.anchor.price)];
                            const [coLX, coLY] = [timeToX(d.label.time), yScale(d.label.price)];
                            const coFont = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const coSize = style.fontSize || 13;
                            const coPad = 12;
                            const coLines = d.text.split('\n');
                            const coMaxLine = Math.max(...coLines.map((l) => l.length), 4);
                            const coW = Math.max(coMaxLine * (coSize * 0.58) + coPad * 2 + 8, 80);
                            const coLineH = coSize * 1.5;
                            const coH = coLines.length * coLineH + coPad * 2 + 4;

                            // Text box: label point is top-left corner
                            const boxX = coLX;
                            const boxY = coLY;
                            const boxCX = boxX + coW / 2;
                            const boxCY = boxY + coH / 2;

                            // Find edge intersection: ray from box center toward anchor
                            const eDx = coAX - boxCX;
                            const eDy = coAY - boxCY;
                            const eDist = Math.sqrt(eDx * eDx + eDy * eDy);
                            let edgeX = boxCX,
                                edgeY = boxCY;
                            if (eDist > 1) {
                                const nx = eDx / eDist;
                                const ny = eDy / eDist;
                                const hw = coW / 2;
                                const hh = coH / 2;
                                const tx = Math.abs(nx) > 0.001 ? hw / Math.abs(nx) : Infinity;
                                const ty = Math.abs(ny) > 0.001 ? hh / Math.abs(ny) : Infinity;
                                const t = Math.min(tx, ty);
                                edgeX = boxCX + nx * t;
                                edgeY = boxCY + ny * t;
                            }

                            return (
                                <g key={key} pointerEvents="auto" shapeRendering="crispEdges">
                                    {/* Anchor ring */}
                                    <circle
                                        cx={coAX}
                                        cy={coAY}
                                        r={6}
                                        fill="none"
                                        stroke="#c4b5f0"
                                        strokeWidth={1.5}
                                        shapeRendering="geometricPrecision"
                                    />
                                    <circle
                                        cx={coAX}
                                        cy={coAY}
                                        r={2.5}
                                        fill="#c4b5f0"
                                        shapeRendering="geometricPrecision"
                                    />

                                    {/* Leader line: anchor → text box edge */}
                                    {eDist > 5 && (
                                        <line
                                            x1={coAX}
                                            y1={coAY}
                                            x2={edgeX}
                                            y2={edgeY}
                                            stroke="#c4b5f0"
                                            strokeWidth={1}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}

                                    {/* Text box */}
                                    <rect
                                        x={boxX}
                                        y={boxY}
                                        width={coW}
                                        height={coH}
                                        rx={8}
                                        fill="#1e1b2e"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        cursor="move"
                                        shapeRendering="geometricPrecision"
                                    />

                                    {coLines.map((line, li) => (
                                        <text
                                            key={li}
                                            x={boxX + coPad}
                                            y={boxY + coPad + coSize - 1 + li * coLineH}
                                            fill="#eae6f4"
                                            fontSize={coSize}
                                            fontWeight={600}
                                            fontFamily={coFont}
                                            className="pointer-events-none"
                                            textRendering="optimizeLegibility"
                                        >
                                            {line}
                                        </text>
                                    ))}

                                    {/* Anchor handle only */}
                                    {isSelected && (
                                        <circle
                                            cx={coAX}
                                            cy={coAY}
                                            r={5}
                                            fill="#131722"
                                            stroke="#c4b5f0"
                                            strokeWidth={2}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                </g>
                            );
                        }
                        case 'Circle': {
                            if (!d.center || !d.edge) return null;
                            const ccx = timeToX(d.center.time),
                                ccy = yScale(d.center.price);
                            const cex = timeToX(d.edge.time),
                                cey = yScale(d.edge.price);
                            const cr = Math.sqrt((cex - ccx) ** 2 + (cey - ccy) ** 2);
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <circle
                                        cx={ccx}
                                        cy={ccy}
                                        r={cr}
                                        fill={style.fillColor || 'transparent'}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        cursor="move"
                                    />
                                    {isSelected && (
                                        <>
                                            {renderHandle(ccx, ccy)}
                                            {renderHandle(cex, cey)}
                                        </>
                                    )}
                                </g>
                            );
                        }
                        case 'Ellipse': {
                            if (!d.start || !d.end) return null;
                            const elx1 = timeToX(d.start.time),
                                ely1 = yScale(d.start.price);
                            const elx2 = timeToX(d.end.time),
                                ely2 = yScale(d.end.price);
                            const elcx = (elx1 + elx2) / 2,
                                elcy = (ely1 + ely2) / 2;
                            const elrx = Math.abs(elx2 - elx1) / 2,
                                elry = Math.abs(ely2 - ely1) / 2;
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <ellipse
                                        cx={elcx}
                                        cy={elcy}
                                        rx={elrx}
                                        ry={elry}
                                        fill={style.fillColor || 'transparent'}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        cursor="move"
                                    />
                                    {isSelected && (
                                        <>
                                            {renderHandle(elx1, ely1)}
                                            {renderHandle(elx2, ely2)}
                                        </>
                                    )}
                                </g>
                            );
                        }
                        case 'Triangle': {
                            if (!d.p1 || !d.p2 || !d.p3) return null;
                            const tp1 = { x: timeToX(d.p1.time), y: yScale(d.p1.price) };
                            const tp2 = { x: timeToX(d.p2.time), y: yScale(d.p2.price) };
                            const tp3 = { x: timeToX(d.p3.time), y: yScale(d.p3.price) };
                            const triPts = `${tp1.x},${tp1.y} ${tp2.x},${tp2.y} ${tp3.x},${tp3.y}`;
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <polygon
                                        points={triPts}
                                        fill={style.fillColor || 'transparent'}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        strokeLinejoin="round"
                                        cursor="move"
                                    />
                                    {isSelected && (
                                        <>
                                            {renderHandle(tp1.x, tp1.y)}
                                            {renderHandle(tp2.x, tp2.y)}
                                            {renderHandle(tp3.x, tp3.y)}
                                        </>
                                    )}
                                </g>
                            );
                        }
                        case 'Arc': {
                            if (!d.start || !d.end || !d.control) return null;
                            const arcS = { x: timeToX(d.start.time), y: yScale(d.start.price) };
                            const arcE = { x: timeToX(d.end.time), y: yScale(d.end.price) };
                            const arcC = { x: timeToX(d.control.time), y: yScale(d.control.price) };
                            const arcPath = `M${arcS.x},${arcS.y} Q${arcC.x},${arcC.y} ${arcE.x},${arcE.y}`;
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <path
                                        d={arcPath}
                                        fill="none"
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        strokeLinecap="round"
                                        cursor="move"
                                    />
                                    <path
                                        d={arcPath}
                                        fill="none"
                                        stroke="transparent"
                                        strokeWidth={HITBOX_WIDTH}
                                        cursor="move"
                                    />
                                    {isSelected && (
                                        <>
                                            {renderHandle(arcS.x, arcS.y)}
                                            {renderHandle(arcE.x, arcE.y)}
                                            {renderHandle(arcC.x, arcC.y, 'move')}
                                            <line
                                                x1={arcS.x}
                                                y1={arcS.y}
                                                x2={arcC.x}
                                                y2={arcC.y}
                                                stroke={style.color}
                                                strokeWidth={0.5}
                                                strokeDasharray="3,3"
                                                opacity={0.3}
                                                className="pointer-events-none"
                                            />
                                            <line
                                                x1={arcE.x}
                                                y1={arcE.y}
                                                x2={arcC.x}
                                                y2={arcC.y}
                                                stroke={style.color}
                                                strokeWidth={0.5}
                                                strokeDasharray="3,3"
                                                opacity={0.3}
                                                className="pointer-events-none"
                                            />
                                        </>
                                    )}
                                </g>
                            );
                        }
                        case 'Polygon': {
                            if (!d.points || d.points.length < 3) return null;
                            const pgPts = d.points.map((pt) => ({
                                x: timeToX(pt.time),
                                y: yScale(pt.price),
                            }));
                            const pgStr = pgPts.map((pt) => `${pt.x},${pt.y}`).join(' ');
                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    <polygon
                                        points={pgStr}
                                        fill={style.fillColor || 'transparent'}
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                        strokeLinejoin="round"
                                        cursor="move"
                                    />
                                    {isSelected &&
                                        pgPts.map((pt, pi) => (
                                            <g key={`ph-${pi}`}>{renderHandle(pt.x, pt.y)}</g>
                                        ))}
                                </g>
                            );
                        }
                        case 'Price Range':
                        case 'Date Range':
                        case 'Date & Price Range': {
                            if (!d.start || !d.end) return null;
                            const [x_s, y_s] = [timeToX(d.start.time), yScale(d.start.price)];
                            const [x_e, y_e] = [timeToX(d.end.time), yScale(d.end.price)];
                            const xL = Math.min(x_s, x_e),
                                yT = Math.min(y_s, y_e);
                            const xR = Math.max(x_s, x_e),
                                yB = Math.max(y_s, y_e);
                            const w = Math.max(xR - xL, 2);
                            const h = Math.max(yB - yT, 2);

                            const priceDelta = d.end.price - d.start.price;
                            const isUp = priceDelta >= 0;
                            const pct =
                                d.start.price !== 0
                                    ? (Math.abs(priceDelta) / d.start.price) * 100
                                    : 0;
                            const timeDelta = Math.abs(d.end.time - d.start.time);
                            const bars = Math.round(timeDelta / candleInterval);
                            const hrs = timeDelta / 3600;

                            // Bright Lavender — high contrast, crisp
                            const accent = d.type === 'Date Range' ? '#bdb0e8' : '#c4b5f0';
                            const rcBg = 'rgba(196,181,240,0.08)';
                            const rcBadge = '#201d30';
                            const rcText = '#f0ecfa';
                            const rcSub = '#b5b0c8';
                            const fontMain = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const fontMono =
                                '"JetBrains Mono","SF Mono","Fira Code","Cascadia Code",monospace';

                            const highPrice = Math.max(d.start.price, d.end.price);
                            const lowPrice = Math.min(d.start.price, d.end.price);
                            const hasPriceAxis = d.type !== 'Date Range';
                            const hasTimeAxis = d.type !== 'Price Range';
                            const priceStr = `${isUp ? '+' : ''}${priceDelta.toFixed(2)}`;
                            const pctStr = `(${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
                            const timeStr =
                                hrs >= 24 ? `${(hrs / 24).toFixed(1)} days` : `${hrs.toFixed(1)}h`;
                            const barsStr = `${bars} bars`;
                            const midX = xL + w / 2;
                            const midY = yT + h / 2;

                            return (
                                <g key={key} pointerEvents="auto" shapeRendering="crispEdges">
                                    {/* Shaded zone */}
                                    <rect
                                        x={xL}
                                        y={yT}
                                        width={w}
                                        height={h}
                                        fill={rcBg}
                                        cursor="move"
                                    />

                                    {/* Zone edges — 1px crisp */}
                                    {hasPriceAxis && (
                                        <>
                                            <line
                                                x1={xL}
                                                y1={yT}
                                                x2={xR}
                                                y2={yT}
                                                stroke={accent}
                                                strokeWidth={1}
                                                opacity={0.6}
                                            />
                                            <line
                                                x1={xL}
                                                y1={yB}
                                                x2={xR}
                                                y2={yB}
                                                stroke={accent}
                                                strokeWidth={1}
                                                opacity={0.6}
                                            />
                                        </>
                                    )}
                                    {hasTimeAxis && (
                                        <>
                                            <line
                                                x1={xL}
                                                y1={yT}
                                                x2={xL}
                                                y2={yB}
                                                stroke={accent}
                                                strokeWidth={1}
                                                opacity={0.6}
                                            />
                                            <line
                                                x1={xR}
                                                y1={yT}
                                                x2={xR}
                                                y2={yB}
                                                stroke={accent}
                                                strokeWidth={1}
                                                opacity={0.4}
                                            />
                                        </>
                                    )}

                                    {/* Vertical measurement line + end caps (Price) */}
                                    {hasPriceAxis && (
                                        <>
                                            <line
                                                x1={xL - 14}
                                                y1={yT}
                                                x2={xL - 14}
                                                y2={yB}
                                                stroke={accent}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xL - 22}
                                                y1={yT}
                                                x2={xL - 6}
                                                y2={yT}
                                                stroke={accent}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xL - 22}
                                                y1={yB}
                                                x2={xL - 6}
                                                y2={yB}
                                                stroke={accent}
                                                strokeWidth={1}
                                            />
                                            {h > 30 && (
                                                <>
                                                    <polygon
                                                        points={`${xL - 14},${yT + 5} ${xL - 18},${yT + 13} ${xL - 10},${yT + 13}`}
                                                        fill={accent}
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                    <polygon
                                                        points={`${xL - 14},${yB - 5} ${xL - 18},${yB - 13} ${xL - 10},${yB - 13}`}
                                                        fill={accent}
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}

                                    {/* Horizontal measurement line + end caps (Time) */}
                                    {hasTimeAxis && (
                                        <>
                                            <line
                                                x1={xL}
                                                y1={yB + 16}
                                                x2={xR}
                                                y2={yB + 16}
                                                stroke={accent}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xL}
                                                y1={yB + 8}
                                                x2={xL}
                                                y2={yB + 24}
                                                stroke={accent}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xR}
                                                y1={yB + 8}
                                                x2={xR}
                                                y2={yB + 24}
                                                stroke={accent}
                                                strokeWidth={1}
                                            />
                                            {w > 30 && (
                                                <>
                                                    <polygon
                                                        points={`${xL + 5},${yB + 16} ${xL + 13},${yB + 12} ${xL + 13},${yB + 20}`}
                                                        fill={accent}
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                    <polygon
                                                        points={`${xR - 5},${yB + 16} ${xR - 13},${yB + 12} ${xR - 13},${yB + 20}`}
                                                        fill={accent}
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}

                                    {/* Price tags removed — data shown in center text */}

                                    {/* Always visible center info — size 14 */}
                                    <g
                                        className="pointer-events-none"
                                        textRendering="optimizeLegibility"
                                    >
                                        {hasPriceAxis && w > 50 && h > 20 && (
                                            <text
                                                x={midX}
                                                y={midY - (hasTimeAxis ? 8 : 0)}
                                                fill={rcText}
                                                fontSize="14"
                                                fontWeight={600}
                                                textAnchor="middle"
                                                fontFamily={fontMain}
                                            >
                                                {priceStr} {pctStr}
                                            </text>
                                        )}
                                        {hasTimeAxis && w > 50 && (
                                            <text
                                                x={midX}
                                                y={midY + (hasPriceAxis ? 12 : 0)}
                                                fill={rcSub}
                                                fontSize="12"
                                                fontWeight={500}
                                                textAnchor="middle"
                                                fontFamily={fontMain}
                                            >
                                                {barsStr} · {timeStr}
                                            </text>
                                        )}
                                    </g>

                                    {/* Anchor handles */}
                                    {isSelected && (
                                        <>
                                            <circle
                                                cx={x_s}
                                                cy={y_s}
                                                r={5}
                                                fill="#131722"
                                                stroke={accent}
                                                strokeWidth={2}
                                                cursor="nwse-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                            <circle
                                                cx={x_e}
                                                cy={y_e}
                                                r={5}
                                                fill="#131722"
                                                stroke={accent}
                                                strokeWidth={2}
                                                cursor="nwse-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                            {d.type === 'Date & Price Range' && (
                                                <>
                                                    <circle
                                                        cx={x_s}
                                                        cy={y_e}
                                                        r={5}
                                                        fill="#131722"
                                                        stroke={accent}
                                                        strokeWidth={2}
                                                        cursor="nesw-resize"
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                    <circle
                                                        cx={x_e}
                                                        cy={y_s}
                                                        r={5}
                                                        fill="#131722"
                                                        stroke={accent}
                                                        strokeWidth={2}
                                                        cursor="nesw-resize"
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}
                                </g>
                            );
                        }

                        case 'Long Position':
                        case 'Short Position': {
                            const pos = d as any;
                            if (!pos.entry || !pos.profit || !pos.stop) return null;
                            const isLong = d.type === 'Long Position';

                            const entryY = yScale(pos.entry.price);
                            const profitY = yScale(pos.profit.price);
                            const stopY = yScale(pos.stop.price);
                            const entryX = timeToX(pos.entry.time);
                            const profitX = timeToX(pos.profit.time);

                            const xL = Math.min(entryX, profitX);
                            const xR = Math.max(entryX, profitX, xL + 10);
                            const bW = xR - xL;

                            const profitDelta = Math.abs(pos.profit.price - pos.entry.price);
                            const stopDelta = Math.abs(pos.stop.price - pos.entry.price);
                            const profitPct =
                                pos.entry.price !== 0
                                    ? ((profitDelta / pos.entry.price) * 100).toFixed(2)
                                    : '0';
                            const stopPct =
                                pos.entry.price !== 0
                                    ? ((stopDelta / pos.entry.price) * 100).toFixed(2)
                                    : '0';
                            const rr = stopDelta > 0 ? (profitDelta / stopDelta).toFixed(2) : '∞';

                            const tpColor = '#089981';
                            const slColor = '#f23645';
                            const entColor = '#8a8a9a';
                            const fontMain = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const fontMono = '"JetBrains Mono","SF Mono","Fira Code",monospace';

                            const tpTop = Math.min(entryY, profitY);
                            const slTop = Math.min(entryY, stopY);
                            const profitH = Math.abs(profitY - entryY);
                            const stopH = Math.abs(stopY - entryY);

                            const fmtPrice = (p: number) => {
                                if (p >= 1000) return p.toFixed(2);
                                if (p >= 1) return p.toFixed(4);
                                return p.toFixed(6);
                            };
                            const entryStr = fmtPrice(pos.entry.price);
                            const targetStr = fmtPrice(pos.profit.price);
                            const stopStr = fmtPrice(pos.stop.price);

                            // Floating panel
                            const panelW = 140;
                            const panelH = 156;
                            const panelX = xR + 14;
                            const panelY = Math.min(profitY, entryY, stopY);

                            return (
                                <g key={key} pointerEvents="auto" shapeRendering="crispEdges">
                                    {/* TP zone */}
                                    <rect
                                        x={xL}
                                        y={tpTop}
                                        width={bW}
                                        height={Math.max(profitH, 1)}
                                        fill={tpColor}
                                        opacity={0.06}
                                        cursor="move"
                                    />
                                    {/* SL zone */}
                                    <rect
                                        x={xL}
                                        y={slTop}
                                        width={bW}
                                        height={Math.max(stopH, 1)}
                                        fill={slColor}
                                        opacity={0.06}
                                        cursor="move"
                                    />

                                    {/* TP line */}
                                    <line
                                        x1={xL}
                                        y1={profitY}
                                        x2={xR}
                                        y2={profitY}
                                        stroke={tpColor}
                                        strokeWidth={1}
                                        opacity={0.7}
                                    />
                                    {/* Entry line */}
                                    <line
                                        x1={xL}
                                        y1={entryY}
                                        x2={xR}
                                        y2={entryY}
                                        stroke={entColor}
                                        strokeWidth={1}
                                        opacity={0.5}
                                    />
                                    {/* SL line */}
                                    <line
                                        x1={xL}
                                        y1={stopY}
                                        x2={xR}
                                        y2={stopY}
                                        stroke={slColor}
                                        strokeWidth={1}
                                        opacity={0.7}
                                    />

                                    {/* Left edge */}
                                    <line
                                        x1={xL}
                                        y1={profitY}
                                        x2={xL}
                                        y2={stopY}
                                        stroke={entColor}
                                        strokeWidth={1}
                                        opacity={0.3}
                                    />

                                    {/* Measurement line + end caps + arrows — only when selected, flush on left edge */}
                                    {isSelected && (
                                        <>
                                            <line
                                                x1={xL}
                                                y1={profitY}
                                                x2={xL}
                                                y2={stopY}
                                                stroke={entColor}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xL - 6}
                                                y1={profitY}
                                                x2={xL + 6}
                                                y2={profitY}
                                                stroke={tpColor}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xL - 6}
                                                y1={entryY}
                                                x2={xL + 6}
                                                y2={entryY}
                                                stroke={entColor}
                                                strokeWidth={1}
                                            />
                                            <line
                                                x1={xL - 6}
                                                y1={stopY}
                                                x2={xL + 6}
                                                y2={stopY}
                                                stroke={slColor}
                                                strokeWidth={1}
                                            />
                                            {profitH > 20 && (
                                                <polygon
                                                    points={`${xL},${profitY + 5} ${xL - 3},${profitY + 12} ${xL + 3},${profitY + 12}`}
                                                    fill={tpColor}
                                                    shapeRendering="geometricPrecision"
                                                />
                                            )}
                                            {stopH > 20 && (
                                                <polygon
                                                    points={`${xL},${stopY - 5} ${xL - 3},${stopY - 12} ${xL + 3},${stopY - 12}`}
                                                    fill={slColor}
                                                    shapeRendering="geometricPrecision"
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* Always-visible info text */}
                                    <g
                                        className="pointer-events-none"
                                        textRendering="optimizeLegibility"
                                    >
                                        {/* TP zone — profit % */}
                                        {profitH > 24 && (
                                            <text
                                                x={xL + bW / 2}
                                                y={tpTop + profitH / 2 + 4}
                                                fill={tpColor}
                                                fontSize="14"
                                                fontWeight={600}
                                                textAnchor="middle"
                                                fontFamily={fontMain}
                                                opacity={0.8}
                                            >
                                                +{profitPct}%
                                            </text>
                                        )}
                                        {/* SL zone — stop % */}
                                        {stopH > 24 && (
                                            <text
                                                x={xL + bW / 2}
                                                y={slTop + stopH / 2 + 4}
                                                fill={slColor}
                                                fontSize="14"
                                                fontWeight={600}
                                                textAnchor="middle"
                                                fontFamily={fontMain}
                                                opacity={0.8}
                                            >
                                                -{stopPct}%
                                            </text>
                                        )}
                                        {/* R:R near entry */}
                                        <text
                                            x={xR - 8}
                                            y={entryY - 6}
                                            fill="#ccc"
                                            fontSize="11"
                                            fontWeight={600}
                                            textAnchor="end"
                                            fontFamily={fontMain}
                                        >
                                            R:R {rr}
                                        </text>
                                        {/* Type label */}
                                        <text
                                            x={xL + 6}
                                            y={entryY - 6}
                                            fill={entColor}
                                            fontSize="11"
                                            fontWeight={500}
                                            fontFamily={fontMain}
                                        >
                                            {isLong ? 'Long' : 'Short'}
                                        </text>
                                    </g>

                                    {/* Drag handles — only when selected, on left edge */}
                                    {isSelected && (
                                        <>
                                            <circle
                                                cx={xL}
                                                cy={profitY}
                                                r={5}
                                                fill="#131722"
                                                stroke={tpColor}
                                                strokeWidth={2}
                                                cursor="ns-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                            <circle
                                                cx={xL}
                                                cy={entryY}
                                                r={5}
                                                fill="#131722"
                                                stroke={entColor}
                                                strokeWidth={2}
                                                cursor="move"
                                                shapeRendering="geometricPrecision"
                                            />
                                            <circle
                                                cx={xL}
                                                cy={stopY}
                                                r={5}
                                                fill="#131722"
                                                stroke={slColor}
                                                strokeWidth={2}
                                                cursor="ns-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                            {/* Right-side entry handle */}
                                            <circle
                                                cx={xR}
                                                cy={entryY}
                                                r={5}
                                                fill="#131722"
                                                stroke={entColor}
                                                strokeWidth={2}
                                                cursor="ew-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                        </>
                                    )}

                                    {/* Floating info panel — only when selected */}
                                    {isSelected &&
                                        (() => {
                                            const pW = 170;
                                            const pH = 200;
                                            const pX = xR + 14;
                                            const pY = Math.min(profitY, entryY, stopY);
                                            const masterText = `${isLong ? 'Long' : 'Short'} Position\nEntry: ${entryStr}\nTP: ${targetStr} (+${profitPct}%)\nSL: ${stopStr} (-${stopPct}%)\nR:R: ${rr}`;
                                            const copyPrice = (
                                                text: string,
                                                label: string,
                                                e: React.MouseEvent
                                            ) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                navigator.clipboard
                                                    .writeText(text)
                                                    .then(() => {
                                                        setCopiedLabel(label);
                                                        setTimeout(
                                                            () => setCopiedLabel(null),
                                                            1500
                                                        );
                                                    })
                                                    .catch((e) => {
                                                        console.warn('Async operation failed:', e);
                                                    });
                                            };
                                            const CopyBtn = ({
                                                x: cx,
                                                y: cy,
                                                value,
                                                label: lb,
                                            }: {
                                                x: number;
                                                y: number;
                                                value: string;
                                                label: string;
                                            }) => (
                                                <g
                                                    cursor="pointer"
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => copyPrice(value, lb, e)}
                                                    opacity={copiedLabel === lb ? 1 : 0.5}
                                                >
                                                    <rect
                                                        x={cx - 3}
                                                        y={cy - 3}
                                                        width={18}
                                                        height={18}
                                                        fill="transparent"
                                                    />
                                                    {copiedLabel === lb ? (
                                                        <path
                                                            transform={`translate(${cx + 1},${cy + 1}) scale(0.45)`}
                                                            d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                                                            fill={tpColor}
                                                        />
                                                    ) : (
                                                        <path
                                                            transform={`translate(${cx},${cy}) scale(0.45)`}
                                                            d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
                                                            fill="#666"
                                                        />
                                                    )}
                                                </g>
                                            );
                                            return (
                                                <g
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    textRendering="optimizeLegibility"
                                                >
                                                    {/* Panel */}
                                                    <rect
                                                        x={pX}
                                                        y={pY}
                                                        width={pW}
                                                        height={pH}
                                                        rx={6}
                                                        fill="#151520"
                                                        stroke="#2a2a3a"
                                                        strokeWidth={1}
                                                        shapeRendering="geometricPrecision"
                                                    />

                                                    {/* Header with master copy */}
                                                    <circle
                                                        cx={pX + 14}
                                                        cy={pY + 16}
                                                        r={5}
                                                        fill={isLong ? tpColor : slColor}
                                                        shapeRendering="geometricPrecision"
                                                    />
                                                    <text
                                                        x={pX + 26}
                                                        y={pY + 20}
                                                        fill="#eee"
                                                        fontSize="14"
                                                        fontWeight={700}
                                                        fontFamily={fontMain}
                                                        className="pointer-events-none"
                                                    >
                                                        {isLong ? 'Long' : 'Short'}
                                                    </text>
                                                    {/* Master copy button */}
                                                    <g
                                                        cursor="pointer"
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                        onClick={(e) =>
                                                            copyPrice(masterText, 'master', e)
                                                        }
                                                        opacity={copiedLabel === 'master' ? 1 : 0.6}
                                                    >
                                                        <rect
                                                            x={pX + pW - 56}
                                                            y={pY + 6}
                                                            width={46}
                                                            height={20}
                                                            rx={4}
                                                            fill={
                                                                copiedLabel === 'master'
                                                                    ? tpColor
                                                                    : '#2a2a3a'
                                                            }
                                                            shapeRendering="geometricPrecision"
                                                        />
                                                        <text
                                                            x={pX + pW - 33}
                                                            y={pY + 20}
                                                            fill="#fff"
                                                            fontSize="9"
                                                            fontWeight={600}
                                                            textAnchor="middle"
                                                            fontFamily={fontMain}
                                                        >
                                                            {copiedLabel === 'master'
                                                                ? 'Copied!'
                                                                : 'Copy All'}
                                                        </text>
                                                    </g>

                                                    <line
                                                        x1={pX + 8}
                                                        y1={pY + 32}
                                                        x2={pX + pW - 8}
                                                        y2={pY + 32}
                                                        stroke="#252535"
                                                        strokeWidth={1}
                                                    />

                                                    {/* Entry */}
                                                    <text
                                                        x={pX + 12}
                                                        y={pY + 52}
                                                        fill="#888"
                                                        fontSize="11"
                                                        fontFamily={fontMain}
                                                        className="pointer-events-none"
                                                    >
                                                        Entry
                                                    </text>
                                                    <text
                                                        x={pX + pW - 24}
                                                        y={pY + 52}
                                                        fill="#ddd"
                                                        fontSize="13"
                                                        fontFamily={fontMono}
                                                        fontWeight={600}
                                                        textAnchor="end"
                                                        className="pointer-events-none"
                                                    >
                                                        {entryStr}
                                                    </text>
                                                    <CopyBtn
                                                        x={pX + pW - 20}
                                                        y={pY + 42}
                                                        value={entryStr}
                                                        label="entry"
                                                    />

                                                    {/* Target */}
                                                    <text
                                                        x={pX + 12}
                                                        y={pY + 78}
                                                        fill="#888"
                                                        fontSize="11"
                                                        fontFamily={fontMain}
                                                        className="pointer-events-none"
                                                    >
                                                        Target
                                                    </text>
                                                    <text
                                                        x={pX + pW - 24}
                                                        y={pY + 78}
                                                        fill={tpColor}
                                                        fontSize="13"
                                                        fontFamily={fontMono}
                                                        fontWeight={600}
                                                        textAnchor="end"
                                                        className="pointer-events-none"
                                                    >
                                                        {targetStr}
                                                    </text>
                                                    <CopyBtn
                                                        x={pX + pW - 20}
                                                        y={pY + 68}
                                                        value={targetStr}
                                                        label="target"
                                                    />
                                                    <text
                                                        x={pX + pW - 24}
                                                        y={pY + 94}
                                                        fill={tpColor}
                                                        fontSize="11"
                                                        fontFamily={fontMono}
                                                        textAnchor="end"
                                                        opacity={0.5}
                                                        className="pointer-events-none"
                                                    >
                                                        +{profitPct}%
                                                    </text>

                                                    {/* Stop */}
                                                    <text
                                                        x={pX + 12}
                                                        y={pY + 116}
                                                        fill="#888"
                                                        fontSize="11"
                                                        fontFamily={fontMain}
                                                        className="pointer-events-none"
                                                    >
                                                        Stop
                                                    </text>
                                                    <text
                                                        x={pX + pW - 24}
                                                        y={pY + 116}
                                                        fill={slColor}
                                                        fontSize="13"
                                                        fontFamily={fontMono}
                                                        fontWeight={600}
                                                        textAnchor="end"
                                                        className="pointer-events-none"
                                                    >
                                                        {stopStr}
                                                    </text>
                                                    <CopyBtn
                                                        x={pX + pW - 20}
                                                        y={pY + 106}
                                                        value={stopStr}
                                                        label="stop"
                                                    />
                                                    <text
                                                        x={pX + pW - 24}
                                                        y={pY + 132}
                                                        fill={slColor}
                                                        fontSize="11"
                                                        fontFamily={fontMono}
                                                        textAnchor="end"
                                                        opacity={0.5}
                                                        className="pointer-events-none"
                                                    >
                                                        -{stopPct}%
                                                    </text>

                                                    <line
                                                        x1={pX + 8}
                                                        y1={pY + 142}
                                                        x2={pX + pW - 8}
                                                        y2={pY + 142}
                                                        stroke="#252535"
                                                        strokeWidth={1}
                                                    />

                                                    {/* R:R */}
                                                    <text
                                                        x={pX + 12}
                                                        y={pY + 164}
                                                        fill="#888"
                                                        fontSize="11"
                                                        fontFamily={fontMain}
                                                        className="pointer-events-none"
                                                    >
                                                        R:R
                                                    </text>
                                                    <text
                                                        x={pX + pW - 12}
                                                        y={pY + 164}
                                                        fill="#eee"
                                                        fontSize="16"
                                                        fontFamily={fontMono}
                                                        textAnchor="end"
                                                        fontWeight={700}
                                                        className="pointer-events-none"
                                                    >
                                                        {rr}
                                                    </text>

                                                    {/* Copied toast */}
                                                    {copiedLabel && copiedLabel !== 'master' && (
                                                        <g className="pointer-events-none">
                                                            <rect
                                                                x={pX + pW / 2 - 30}
                                                                y={pY + pH + 6}
                                                                width={60}
                                                                height={20}
                                                                rx={4}
                                                                fill={tpColor}
                                                                opacity={0.9}
                                                                shapeRendering="geometricPrecision"
                                                            />
                                                            <text
                                                                x={pX + pW / 2}
                                                                y={pY + pH + 20}
                                                                fill="#fff"
                                                                fontSize="10"
                                                                fontWeight={600}
                                                                textAnchor="middle"
                                                                fontFamily={fontMain}
                                                            >
                                                                Copied!
                                                            </text>
                                                        </g>
                                                    )}
                                                </g>
                                            );
                                        })()}
                                </g>
                            );
                        }
                        case 'Price Label': {
                            if (!d.point) return null;
                            const plX = timeToX(d.point.time);
                            const plY = yScale(d.point.price);
                            const plFont = '"JetBrains Mono","SF Mono","Fira Code",monospace';
                            const plText = (d as any).text || d.point.price.toFixed(2);
                            const plW = Math.max(plText.length * 8 + 20, 70);
                            return (
                                <g key={key} pointerEvents="auto" shapeRendering="crispEdges">
                                    <line
                                        x1={0}
                                        y1={plY}
                                        x2={chartDimensions.width}
                                        y2={plY}
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        strokeDasharray="4,4"
                                        opacity={0.4}
                                    />
                                    <rect
                                        x={plX - plW / 2}
                                        y={plY - 14}
                                        width={plW}
                                        height={28}
                                        rx={4}
                                        fill="#1e1b2e"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        cursor="move"
                                        shapeRendering="geometricPrecision"
                                    />
                                    <text
                                        x={plX}
                                        y={plY + 5}
                                        fill="#eae6f4"
                                        fontSize="13"
                                        fontWeight={600}
                                        textAnchor="middle"
                                        fontFamily={plFont}
                                        className="pointer-events-none"
                                        textRendering="optimizeLegibility"
                                    >
                                        {plText}
                                    </text>
                                    {isSelected && (
                                        <>
                                            <circle
                                                cx={plX - plW / 2}
                                                cy={plY}
                                                r={4}
                                                fill="#131722"
                                                stroke="#c4b5f0"
                                                strokeWidth={1.5}
                                                shapeRendering="geometricPrecision"
                                            />
                                            <circle
                                                cx={plX + plW / 2}
                                                cy={plY}
                                                r={4}
                                                fill="#131722"
                                                stroke="#c4b5f0"
                                                strokeWidth={1.5}
                                                shapeRendering="geometricPrecision"
                                            />
                                        </>
                                    )}
                                </g>
                            );
                        }

                        case 'Signal Marker': {
                            if (!d.point) return null;
                            const smX = timeToX(d.point.time);
                            const smY = yScale(d.point.price);
                            const smIsBuy = (d as any).signal === 'buy';
                            const smColor = smIsBuy ? '#089981' : '#f23645';
                            const smLabel = smIsBuy ? 'BUY' : 'SELL';
                            const smFont = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const smPriceStr =
                                d.point.price >= 1000
                                    ? d.point.price.toFixed(2)
                                    : d.point.price.toFixed(4);
                            return (
                                <g key={key} pointerEvents="auto" cursor="move">
                                    {smIsBuy ? (
                                        <polygon
                                            points={`${smX},${smY} ${smX - 10},${smY + 18} ${smX + 10},${smY + 18}`}
                                            fill={smColor}
                                            shapeRendering="geometricPrecision"
                                        />
                                    ) : (
                                        <polygon
                                            points={`${smX},${smY} ${smX - 10},${smY - 18} ${smX + 10},${smY - 18}`}
                                            fill={smColor}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                    <text
                                        x={smX}
                                        y={smIsBuy ? smY + 34 : smY - 24}
                                        fill={smColor}
                                        fontSize="11"
                                        fontWeight={700}
                                        textAnchor="middle"
                                        fontFamily={smFont}
                                        className="pointer-events-none"
                                        textRendering="optimizeLegibility"
                                    >
                                        {smLabel}
                                    </text>
                                    <text
                                        x={smX}
                                        y={smIsBuy ? smY - 8 : smY + 14}
                                        fill={smColor}
                                        fontSize="9"
                                        textAnchor="middle"
                                        fontFamily="monospace"
                                        opacity={0.6}
                                        className="pointer-events-none"
                                    >
                                        {smPriceStr}
                                    </text>
                                    {isSelected && (
                                        <circle
                                            cx={smX}
                                            cy={smY}
                                            r={5}
                                            fill="#131722"
                                            stroke={smColor}
                                            strokeWidth={2}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                </g>
                            );
                        }

                        case 'Note Flag': {
                            if (!d.point) return null;
                            const nfX = timeToX(d.point.time);
                            const nfY = yScale(d.point.price);
                            const nfText = (d as any).text || 'Flag';
                            const nfFont = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const nfFlagW = Math.max(nfText.length * 7 + 16, 50);
                            return (
                                <g
                                    key={key}
                                    pointerEvents="auto"
                                    cursor="move"
                                    shapeRendering="crispEdges"
                                >
                                    <line
                                        x1={nfX}
                                        y1={nfY - 50}
                                        x2={nfX}
                                        y2={nfY}
                                        stroke="#c4b5f0"
                                        strokeWidth={1}
                                    />
                                    <path
                                        d={`M${nfX},${nfY - 50} L${nfX + nfFlagW},${nfY - 40} L${nfX},${nfY - 30} Z`}
                                        fill="rgba(196,181,240,0.15)"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        shapeRendering="geometricPrecision"
                                    />
                                    <text
                                        x={nfX + nfFlagW * 0.35}
                                        y={nfY - 37}
                                        fill="#eae6f4"
                                        fontSize="10"
                                        fontWeight={600}
                                        textAnchor="middle"
                                        fontFamily={nfFont}
                                        className="pointer-events-none"
                                        textRendering="optimizeLegibility"
                                    >
                                        {nfText}
                                    </text>
                                    <circle
                                        cx={nfX}
                                        cy={nfY}
                                        r={4}
                                        fill="#131722"
                                        stroke="#c4b5f0"
                                        strokeWidth={1.5}
                                        shapeRendering="geometricPrecision"
                                    />
                                    {isSelected && (
                                        <circle
                                            cx={nfX}
                                            cy={nfY}
                                            r={5}
                                            fill="#131722"
                                            stroke="#c4b5f0"
                                            strokeWidth={2}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                </g>
                            );
                        }

                        case 'Highlight Zone': {
                            if (!d.start || !d.end) return null;
                            const hzX1 = timeToX(d.start.time),
                                hzY1 = yScale(d.start.price);
                            const hzX2 = timeToX(d.end.time),
                                hzY2 = yScale(d.end.price);
                            const hzL = Math.min(hzX1, hzX2),
                                hzT = Math.min(hzY1, hzY2);
                            const hzW = Math.max(Math.abs(hzX2 - hzX1), 2),
                                hzH = Math.max(Math.abs(hzY2 - hzY1), 2);
                            const hzText = (d as any).text || '';
                            const hzFont = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            return (
                                <g key={key} pointerEvents="auto" shapeRendering="crispEdges">
                                    <rect
                                        x={hzL}
                                        y={hzT}
                                        width={hzW}
                                        height={hzH}
                                        rx={4}
                                        fill="rgba(196,181,240,0.08)"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        strokeDasharray="4,3"
                                        cursor="move"
                                        shapeRendering="geometricPrecision"
                                    />
                                    {hzText && hzW > 40 && hzH > 16 && (
                                        <text
                                            x={hzL + hzW / 2}
                                            y={hzT + hzH / 2 + 4}
                                            fill="#c4b5f0"
                                            fontSize="12"
                                            fontWeight={600}
                                            textAnchor="middle"
                                            fontFamily={hzFont}
                                            opacity={0.6}
                                            className="pointer-events-none"
                                            textRendering="optimizeLegibility"
                                        >
                                            {hzText}
                                        </text>
                                    )}
                                    {isSelected && (
                                        <>
                                            <circle
                                                cx={hzX1}
                                                cy={hzY1}
                                                r={4}
                                                fill="#131722"
                                                stroke="#c4b5f0"
                                                strokeWidth={1.5}
                                                cursor="nwse-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                            <circle
                                                cx={hzX2}
                                                cy={hzY2}
                                                r={4}
                                                fill="#131722"
                                                stroke="#c4b5f0"
                                                strokeWidth={1.5}
                                                cursor="nwse-resize"
                                                shapeRendering="geometricPrecision"
                                            />
                                        </>
                                    )}
                                </g>
                            );
                        }

                        case 'Emoji Sticker': {
                            if (!d.point) return null;
                            const esX = timeToX(d.point.time);
                            const esY = yScale(d.point.price);
                            const esEmoji = (d as any).emoji || '🎯';
                            return (
                                <g key={key} pointerEvents="auto" cursor="move">
                                    <circle
                                        cx={esX}
                                        cy={esY}
                                        r={18}
                                        fill="rgba(196,181,240,0.06)"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.3}
                                        shapeRendering="geometricPrecision"
                                    />
                                    <text
                                        x={esX}
                                        y={esY + 8}
                                        fontSize="22"
                                        textAnchor="middle"
                                        className="pointer-events-none"
                                    >
                                        {esEmoji}
                                    </text>
                                    {isSelected && (
                                        <circle
                                            cx={esX}
                                            cy={esY}
                                            r={5}
                                            fill="#131722"
                                            stroke="#c4b5f0"
                                            strokeWidth={2}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                </g>
                            );
                        }

                        case 'Measure Tool': {
                            if (!d.start || !d.end) return null;
                            const mtX1 = timeToX(d.start.time),
                                mtY1 = yScale(d.start.price);
                            const mtX2 = timeToX(d.end.time),
                                mtY2 = yScale(d.end.price);
                            const mtDelta = d.end.price - d.start.price;
                            const mtPct =
                                d.start.price !== 0
                                    ? ((Math.abs(mtDelta) / d.start.price) * 100).toFixed(2)
                                    : '0';
                            const mtBars = Math.round(
                                Math.abs(d.end.time - d.start.time) / candleInterval
                            );
                            const mtFont = '"Inter","SF Pro Display",-apple-system,sans-serif';
                            const mtMono = '"JetBrains Mono","SF Mono",monospace';
                            const mtMidX = (mtX1 + mtX2) / 2,
                                mtMidY = (mtY1 + mtY2) / 2;
                            const mtIsUp = mtDelta >= 0;
                            return (
                                <g key={key} pointerEvents="auto" shapeRendering="crispEdges">
                                    {/* Main diagonal line */}
                                    <line
                                        x1={mtX1}
                                        y1={mtY1}
                                        x2={mtX2}
                                        y2={mtY2}
                                        stroke="#c4b5f0"
                                        strokeWidth={1}
                                        shapeRendering="geometricPrecision"
                                    />
                                    {/* Right angle guides */}
                                    <line
                                        x1={mtX1}
                                        y1={mtY1}
                                        x2={mtX2}
                                        y2={mtY1}
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        strokeDasharray="2,3"
                                        opacity={0.3}
                                    />
                                    <line
                                        x1={mtX2}
                                        y1={mtY1}
                                        x2={mtX2}
                                        y2={mtY2}
                                        stroke="#c4b5f0"
                                        strokeWidth={0.5}
                                        strokeDasharray="2,3"
                                        opacity={0.3}
                                    />
                                    {/* Info label */}
                                    <rect
                                        x={mtMidX - 50}
                                        y={mtMidY - 18}
                                        width={100}
                                        height={36}
                                        rx={4}
                                        fill="#1e1b2e"
                                        stroke="#c4b5f0"
                                        strokeWidth={0.3}
                                        cursor="move"
                                        shapeRendering="geometricPrecision"
                                    />
                                    <text
                                        x={mtMidX}
                                        y={mtMidY - 3}
                                        fill={mtIsUp ? '#089981' : '#f23645'}
                                        fontSize="12"
                                        fontWeight={600}
                                        textAnchor="middle"
                                        fontFamily={mtMono}
                                        className="pointer-events-none"
                                        textRendering="optimizeLegibility"
                                    >
                                        {mtIsUp ? '+' : ''}
                                        {mtDelta.toFixed(2)}
                                    </text>
                                    <text
                                        x={mtMidX}
                                        y={mtMidY + 12}
                                        fill="#a09bb0"
                                        fontSize="10"
                                        textAnchor="middle"
                                        fontFamily={mtFont}
                                        className="pointer-events-none"
                                    >
                                        {mtBars} bars · {mtPct}%
                                    </text>
                                    {/* Handles */}
                                    <circle
                                        cx={mtX1}
                                        cy={mtY1}
                                        r={5}
                                        fill="#131722"
                                        stroke="#c4b5f0"
                                        strokeWidth={2}
                                        cursor="crosshair"
                                        shapeRendering="geometricPrecision"
                                    />
                                    <circle
                                        cx={mtX2}
                                        cy={mtY2}
                                        r={5}
                                        fill="#131722"
                                        stroke="#c4b5f0"
                                        strokeWidth={2}
                                        cursor="crosshair"
                                        shapeRendering="geometricPrecision"
                                    />
                                </g>
                            );
                        }

                        default:
                            return null;
                    }
                })}
                {overlayIndicators.map((indicator) => {
                    try {
                        if (!indicator.data) return null;
                        if (indicator.isVisible === false) return null;

                        // Common helper to get integer iterations for visible range
                        // Fixes the "fractional index return undefined" bug
                        const startIdx = Math.max(0, Math.floor(view.startIndex));
                        const endIdx = Math.min(
                            data.length,
                            Math.ceil(view.startIndex + view.visibleCandles)
                        );

                        // Helper to build path string
                        const buildPath = (values: (number | null)[]) => {
                            const points: [number, number][] = [];
                            for (let i = startIdx; i < endIdx; i++) {
                                const val = values[i];
                                if (val !== null && val !== undefined && isFinite(val as number)) {
                                    const y = yScale(val);
                                    if (isFinite(y)) {
                                        points.push([indexToX(i - view.startIndex), y]);
                                    }
                                }
                            }
                            if (points.length === 0) return '';
                            return points
                                .map((p, i) => (i === 0 ? 'M' : 'L') + `${p[0]},${p[1]}`)
                                .join(' ');
                        };

                        // Helper to build polygon points for fill
                        const buildFill = (upper: (number | null)[], lower: (number | null)[]) => {
                            const topPoints: [number, number][] = [];
                            const bottomPoints: [number, number][] = [];

                            for (let i = startIdx; i < endIdx; i++) {
                                const u = upper[i];
                                const l = lower[i];
                                if (
                                    u !== null &&
                                    u !== undefined &&
                                    l !== null &&
                                    l !== undefined
                                ) {
                                    const x = indexToX(i - view.startIndex);
                                    topPoints.push([x, yScale(u)]);
                                    bottomPoints.unshift([x, yScale(l)]); // Reverse order for bottom
                                }
                            }

                            if (topPoints.length === 0) return '';
                            const allPoints = [...topPoints, ...bottomPoints];
                            return allPoints.map((p) => `${p[0]},${p[1]}`).join(' ');
                        };

                        // Get user style settings
                        const indLineWidth = (indicator.settings as any)?.lineWidth || 2;
                        const indLineStyle = (indicator.settings as any)?.lineStyle || 'solid';
                        const indDash =
                            indLineStyle === 'dashed'
                                ? '6,3'
                                : indLineStyle === 'dotted'
                                  ? '2,2'
                                  : undefined;

                        // Single-line indicators (moving averages, oscillators, VWAP, ATR, KURI_LINE, ADR + new MAs)
                        if (
                            [
                                'MA',
                                'SMA',
                                'EMA',
                                'WMA',
                                'VWMA',
                                'HMA',
                                'VWAP',
                                'ATR',
                                'KURI_LINE',
                                'DEMA',
                                'TEMA',
                                'ALMA',
                                'KAMA',
                                'SMMA',
                                'ZLEMA',
                                'RMA',
                                'SWMA',
                                'LINREG',
                                'SAR',
                                'ADR',
                                'RSI',
                                'ADX',
                                'CCI',
                                'MFI',
                                'OBV',
                                'ROC',
                                'MOM',
                                'WPR',
                                'CMO',
                                'TSI',
                                'CMF',
                                'ACCDIST',
                                'BBW',
                                'PERCENT_B',
                                'KCW',
                                'TR',
                                'STDEV',
                                'PERCENTRANK',
                            ].includes(indicator.type)
                        ) {
                            // KURI_LINE with multiple series (grouped plots from same script)
                            const dataKeys = Object.keys(indicator.data);
                            const seriesColors = (indicator.settings as any)?.seriesColors as
                                | Record<string, string>
                                | undefined;
                            if (indicator.type === 'KURI_LINE' && seriesColors) {
                                const paths: React.ReactNode[] = [];
                                dataKeys.forEach((key) => {
                                    const values = indicator.data[key] as (number | null)[];
                                    const path = buildPath(values);
                                    if (path) {
                                        paths.push(
                                            <path
                                                key={`${indicator.id}-${key}`}
                                                d={path}
                                                stroke={
                                                    seriesColors[key] ||
                                                    indicator.settings.color ||
                                                    '#2962FF'
                                                }
                                                strokeWidth={indLineWidth}
                                                strokeDasharray={indDash}
                                                fill="none"
                                                pointerEvents="none"
                                            />
                                        );
                                    }
                                });
                                return <g key={indicator.id}>{paths}</g>;
                            }

                            const path = buildPath(
                                indicator.data.main || indicator.data[dataKeys[0]] || []
                            );
                            return (
                                <path
                                    key={indicator.id}
                                    d={path}
                                    stroke={
                                        (indicator.settings as any)?.valueColor ||
                                        indicator.settings.color ||
                                        '#2962FF'
                                    }
                                    strokeWidth={indLineWidth}
                                    strokeDasharray={indDash}
                                    fill="none"
                                    pointerEvents="none"
                                />
                            );
                        }

                        // Kuri Histogram / Columns
                        if (
                            (indicator.type as any) === 'KURI_HISTOGRAM' ||
                            (indicator.type as any) === 'KURI_COLUMNS'
                        ) {
                            const values = indicator.data.main || [];
                            const zeroVal = yScale.domain()[0] > 0 ? yScale.domain()[0] : 0; // Baseline at 0 or bottom of scale
                            const zeroY = yScale(zeroVal);
                            const barWidth = Math.max(
                                1,
                                (indexToX(1) || 0) - (indexToX(0) || 0) - 2
                            );

                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {values.map((val, i) => {
                                        if (
                                            i < startIdx ||
                                            i >= endIdx ||
                                            val === null ||
                                            val === undefined ||
                                            isNaN(val)
                                        )
                                            return null;
                                        const x =
                                            (indexToX(i - view.startIndex) || 0) - barWidth / 2;
                                        const y = yScale(val);
                                        if (isNaN(y) || !isFinite(y) || isNaN(zeroY)) return null;
                                        const height = Math.abs(y - zeroY);
                                        const top = val >= 0 ? y : zeroY;
                                        const color =
                                            (indicator.settings as any)?.color ||
                                            (val >= 0 ? '#089981' : '#f23645');

                                        return (
                                            <rect
                                                key={i}
                                                x={x}
                                                y={top}
                                                width={barWidth}
                                                height={Math.max(1, height)}
                                                fill={color}
                                                fillOpacity="0.5"
                                            />
                                        );
                                    })}
                                </g>
                            );
                        }

                        // Kuri Area — line with filled region below
                        if (indicator.type === 'KURI_AREA') {
                            const values = indicator.data.main || [];
                            const path = buildPath(values);
                            // Build closed polygon for fill
                            const fillPts: string[] = [];
                            let firstX = 0;
                            let lastX = 0;
                            for (let i = startIdx; i < endIdx; i++) {
                                const val = values[i];
                                if (val !== null && val !== undefined && !isNaN(val)) {
                                    const x = indexToX(i - view.startIndex);
                                    const y = yScale(val);
                                    if (!isNaN(x) && isFinite(x) && !isNaN(y) && isFinite(y)) {
                                        if (fillPts.length === 0) firstX = x;
                                        lastX = x;
                                        fillPts.push(`${x},${y}`);
                                    }
                                }
                            }
                            const bottomY = chartDimensions.height;
                            const fillColor =
                                (indicator.settings as any)?.fillColor ||
                                indicator.settings.color ||
                                '#2962FF';
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {fillPts.length > 1 && (
                                        <polygon
                                            points={`${fillPts.join(' ')} ${lastX},${bottomY} ${firstX},${bottomY}`}
                                            fill={fillColor}
                                            fillOpacity="0.15"
                                            stroke="none"
                                        />
                                    )}
                                    <path
                                        d={path}
                                        stroke={indicator.settings.color || '#2962FF'}
                                        strokeWidth={indLineWidth}
                                        fill="none"
                                    />
                                </g>
                            );
                        }

                        // Kuri Band — upper/lower/middle with fill
                        if (indicator.type === 'KURI_BAND') {
                            const upper = indicator.data.upper || [];
                            const lower = indicator.data.lower || [];
                            const middle = indicator.data.middle || [];
                            const fillPoints = buildFill(upper, lower);
                            const color = indicator.settings.color || '#2962FF';
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {fillPoints && (
                                        <polygon
                                            points={fillPoints}
                                            fill={color}
                                            fillOpacity="0.1"
                                            stroke="none"
                                        />
                                    )}
                                    <path
                                        d={buildPath(upper)}
                                        stroke={(indicator.settings as any)?.upperColor || color}
                                        strokeWidth={indLineWidth}
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(lower)}
                                        stroke={(indicator.settings as any)?.lowerColor || color}
                                        strokeWidth={indLineWidth}
                                        fill="none"
                                    />
                                    {middle.length > 0 && (
                                        <path
                                            d={buildPath(middle)}
                                            stroke="#FF6D00"
                                            strokeWidth={indLineWidth}
                                            strokeDasharray="4,2"
                                            fill="none"
                                        />
                                    )}
                                </g>
                            );
                        }

                        // Kuri Markers — circles/triangles at data points
                        if (indicator.type === 'KURI_MARKERS') {
                            const values = indicator.data.main || [];
                            const color = indicator.settings.color || '#FF9800';
                            const markers: React.ReactNode[] = [];
                            for (let i = startIdx; i < endIdx; i++) {
                                const val = values[i];
                                if (
                                    val !== null &&
                                    val !== undefined &&
                                    val !== 0 &&
                                    !isNaN(val as any)
                                ) {
                                    const x = indexToX(i - view.startIndex);
                                    const y = yScale(
                                        typeof val === 'number' ? val : data[i]?.close || 0
                                    );
                                    if (!isNaN(x) && isFinite(x) && !isNaN(y) && isFinite(y)) {
                                        markers.push(
                                            <circle
                                                key={i}
                                                cx={x}
                                                cy={y}
                                                r={4}
                                                fill={color}
                                                stroke="#fff"
                                                strokeWidth={1}
                                            />
                                        );
                                    }
                                }
                            }
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {markers}
                                </g>
                            );
                        }

                        // MACD: macd line + signal line + histogram bars
                        if (indicator.type === 'MACD') {
                            const macdLine = indicator.data.macd || indicator.data.main || [];
                            const signalLine = indicator.data.signal || [];
                            const histogram = indicator.data.histogram || [];

                            const zeroVal = 0;
                            const zeroY = yScale(zeroVal);
                            const barWidth = Math.max(
                                1,
                                (indexToX(1) || 0) - (indexToX(0) || 0) - 2
                            );

                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {/* Histogram bars */}
                                    {histogram.map((val: number | null, i: number) => {
                                        if (
                                            i < startIdx ||
                                            i >= endIdx ||
                                            val === null ||
                                            val === undefined ||
                                            isNaN(val)
                                        )
                                            return null;
                                        const x =
                                            (indexToX(i - view.startIndex) || 0) - barWidth / 2;
                                        const y = yScale(val);
                                        if (isNaN(y) || !isFinite(y) || isNaN(zeroY)) return null;
                                        const height = Math.abs(y - zeroY);
                                        const top = val >= 0 ? y : zeroY;
                                        const color = val >= 0 ? '#26A69A' : '#EF5350';
                                        return (
                                            <rect
                                                key={`h-${i}`}
                                                x={x}
                                                y={top}
                                                width={barWidth}
                                                height={Math.max(0.5, height)}
                                                fill={color}
                                                fillOpacity="0.5"
                                            />
                                        );
                                    })}
                                    {/* MACD line */}
                                    <path
                                        d={buildPath(macdLine)}
                                        stroke={(indicator.settings as any)?.macdColor || '#2962FF'}
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                    {/* Signal line */}
                                    <path
                                        d={buildPath(signalLine)}
                                        stroke={
                                            (indicator.settings as any)?.signalColor || '#FF6D00'
                                        }
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                </g>
                            );
                        }

                        // Stochastic: %K line + %D line
                        if (indicator.type === 'Stochastic') {
                            const kLine = indicator.data.k || indicator.data.main || [];
                            const dLine = indicator.data.d || [];

                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {/* %K line */}
                                    <path
                                        d={buildPath(kLine)}
                                        stroke={(indicator.settings as any)?.kColor || '#2962FF'}
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                    {/* %D line */}
                                    <path
                                        d={buildPath(dLine)}
                                        stroke={(indicator.settings as any)?.dColor || '#FF6D00'}
                                        strokeWidth={indLineWidth}
                                        strokeDasharray="4,2"
                                        fill="none"
                                    />
                                </g>
                            );
                        }

                        if (
                            (indicator.type as string) === 'Bollinger Bands' ||
                            indicator.type === 'BB'
                        ) {
                            const upper = indicator.data.upper || [];
                            const lower = indicator.data.lower || [];
                            const middle = indicator.data.middle || [];

                            const fillPoints = buildFill(upper, lower);
                            const upperPath = buildPath(upper);
                            const lowerPath = buildPath(lower);
                            const middlePath = buildPath(middle);

                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    <polygon
                                        points={fillPoints}
                                        fill={
                                            (indicator.settings as any)?.upperColor ||
                                            indicator.settings.color ||
                                            '#2962FF'
                                        }
                                        fillOpacity="0.1"
                                        stroke="none"
                                    />
                                    <path
                                        d={upperPath}
                                        stroke={
                                            (indicator.settings as any)?.upperColor ||
                                            indicator.settings.color ||
                                            '#2962FF'
                                        }
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                    <path
                                        d={lowerPath}
                                        stroke={
                                            (indicator.settings as any)?.lowerColor ||
                                            indicator.settings.color ||
                                            '#2962FF'
                                        }
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                    <path
                                        d={middlePath}
                                        stroke={
                                            (indicator.settings as any)?.middleColor || '#FF6D00'
                                        }
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                        strokeOpacity="0.7"
                                    />
                                </g>
                            );
                        }

                        if (indicator.type === 'MA Ribbon') {
                            const paths: React.ReactNode[] = [];
                            if (indicator.data) {
                                Object.entries(indicator.data).forEach(([key, values]) => {
                                    if (key.startsWith('ma_')) {
                                        const lineValues = values as (number | null)[];
                                        const path = buildPath(lineValues);
                                        if (path) {
                                            paths.push(
                                                <path
                                                    key={`${indicator.id}-${key}`}
                                                    d={path}
                                                    stroke={
                                                        indicator.settings.ribbonBaseColor ||
                                                        '#2962FF'
                                                    }
                                                    strokeWidth="1"
                                                    fill="none"
                                                    strokeOpacity="0.6"
                                                    pointerEvents="none"
                                                />
                                            );
                                        }
                                    }
                                });
                            }
                            return <g key={indicator.id}>{paths}</g>;
                        }

                        // Donchian Channels
                        if (
                            indicator.type === 'DONCHIAN' ||
                            indicator.type === 'DC' ||
                            (indicator.type as string) === 'Donchian Channels'
                        ) {
                            const upper = indicator.data.upper || [];
                            const lower = indicator.data.lower || [];
                            const basis = indicator.data.basis || indicator.data.main || [];

                            const fillPoints = buildFill(upper, lower);
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    <polygon
                                        points={fillPoints}
                                        fill="#2196F3"
                                        fillOpacity="0.05"
                                        stroke="none"
                                    />
                                    <path
                                        d={buildPath(upper)}
                                        stroke="#2962FF"
                                        strokeWidth="1"
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(lower)}
                                        stroke="#2962FF"
                                        strokeWidth="1"
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(basis)}
                                        stroke="#FF6D00"
                                        strokeWidth="1.5"
                                        fill="none"
                                    />
                                </g>
                            );
                        }

                        // Ichimoku Cloud
                        if (
                            indicator.type === 'ICHIMOKU' ||
                            indicator.type === 'Ichimoku' ||
                            (indicator.type as string) === 'Ichimoku Cloud'
                        ) {
                            const conversion = indicator.data.conversion || [];
                            const base = indicator.data.base || [];
                            const spanA = indicator.data.spanA || [];
                            const spanB = indicator.data.spanB || [];
                            const cloudFill = buildFill(spanA, spanB);
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    <polygon
                                        points={cloudFill}
                                        fill="#4CAF50"
                                        fillOpacity="0.06"
                                        stroke="none"
                                    />
                                    <path
                                        d={buildPath(conversion)}
                                        stroke="#2962FF"
                                        strokeWidth="1.5"
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(base)}
                                        stroke="#B71C1C"
                                        strokeWidth="1.5"
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(spanA)}
                                        stroke="#A5D6A7"
                                        strokeWidth="1"
                                        fill="none"
                                        strokeOpacity="0.7"
                                    />
                                    <path
                                        d={buildPath(spanB)}
                                        stroke="#EF9A9A"
                                        strokeWidth="1"
                                        fill="none"
                                        strokeOpacity="0.7"
                                    />
                                </g>
                            );
                        }

                        // Keltner Channels
                        if (
                            indicator.type === 'KELTNER' ||
                            indicator.type === 'KC' ||
                            (indicator.type as string) === 'Keltner Channels'
                        ) {
                            const upper = indicator.data.upper || [];
                            const lower = indicator.data.lower || [];
                            const basis = indicator.data.basis || indicator.data.main || [];
                            const fillPoints = buildFill(upper, lower);
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    <polygon
                                        points={fillPoints}
                                        fill="#2196F3"
                                        fillOpacity="0.05"
                                        stroke="none"
                                    />
                                    <path
                                        d={buildPath(upper)}
                                        stroke="#2962FF"
                                        strokeWidth="1"
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(lower)}
                                        stroke="#2962FF"
                                        strokeWidth="1"
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(basis)}
                                        stroke="#2962FF"
                                        strokeWidth="1.5"
                                        fill="none"
                                    />
                                </g>
                            );
                        }

                        if (indicator.type === 'SuperTrend') {
                            const supertrend = indicator.data.supertrend || [];
                            const directions = indicator.data.direction || [];

                            // We need to draw segments with different colors
                            // Simple approach: Iterate and create multiple paths or individual lines
                            // Optimization: Create two paths, one green one red

                            const greenPoints: [number, number][] = [];
                            const redPoints: [number, number][] = [];
                            // We need to handle transitions carefully.
                            // For now, simple dot-to-dot segments might be best or specific path builders

                            const segments = [];

                            for (let i = startIdx; i < endIdx - 1; i++) {
                                const idx = i;
                                const nextIdx = i + 1;

                                const val = supertrend[idx];
                                const nextVal = supertrend[nextIdx];
                                const dir = directions[idx]; // 1 or -1

                                if (val !== null && nextVal !== null) {
                                    const x1 = indexToX(idx - view.startIndex);
                                    const y1 = yScale(val);
                                    const x2 = indexToX(nextIdx - view.startIndex);
                                    const y2 = yScale(nextVal);

                                    const color = dir === 1 ? '#00E676' : '#FF5252';

                                    segments.push(
                                        <line
                                            key={`${indicator.id}-${i}`}
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke={color}
                                            strokeWidth="2"
                                        />
                                    );
                                }
                            }
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {segments}
                                </g>
                            );
                        }

                        // Kuri Markers
                        if ((indicator.type as any) === 'KURI_MARKERS') {
                            const values = indicator.data.main || [];
                            const color = indicator.settings.color || '#2962FF';
                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    {values.map((val, i) => {
                                        if (
                                            i < startIdx ||
                                            i >= endIdx ||
                                            val === null ||
                                            val === undefined
                                        )
                                            return null;
                                        return (
                                            <circle
                                                key={i}
                                                cx={indexToX(i - view.startIndex)}
                                                cy={yScale(val)}
                                                r={4}
                                                fill={color}
                                                stroke="#fff"
                                                strokeWidth={1}
                                            />
                                        );
                                    })}
                                </g>
                            );
                        }

                        // If we reach here, the indicator type was not handled by any rendering branch
                        const renderWarnKey = `render_${indicator.id}_${indicator.type}`;
                        if (!loggedIndicatorWarnings.current.has(renderWarnKey)) {
                            loggedIndicatorWarnings.current.add(renderWarnKey);
                            addConsoleLog(
                                'warn',
                                'Render',
                                `No rendering handler for indicator type="${indicator.type}" — "${indicator.kuriPlotTitle || 'unnamed'}" will not be drawn.`,
                                `Data keys: [${Object.keys(indicator.data).join(', ')}], kuriOverlay: ${indicator.kuriOverlay}`
                            );
                        }
                        return null;
                    } catch (e) {
                        console.error(
                            'Error rendering indicator:',
                            indicator.id,
                            indicator.type,
                            e
                        );
                        addConsoleLog(
                            'error',
                            'Render',
                            `Failed to render "${indicator.kuriPlotTitle || indicator.type}": ${e instanceof Error ? e.message : String(e)}`,
                            `Indicator ID: ${indicator.id}`
                        );
                        if (onChartError) {
                            onChartError(
                                toChartErrorFromString(
                                    `Failed to render ${indicator.type || indicator.id}`,
                                    `${indicator.type || 'Indicator'}`
                                )
                            );
                        }
                        return null;
                    }
                })}
            </>
        );
    };

    return (
        <>
            <style>
                {`
        @keyframes slideInUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-in-up {
          animation: slideInUp 0.3s ease-out forwards;
        }
        `}
            </style>
            <div
                ref={fullscreenContainerRef}
                className="bg-black text-gray-300 flex flex-col h-full w-full overflow-hidden font-sans touch-none"
            >
                <ChartHeader
                    symbol={symbol}
                    onSymbolChange={props.onSymbolChange}
                    allTimeframes={props.allTimeframes}
                    favoriteTimeframes={props.favoriteTimeframes}
                    activeTimeframe={props.activeTimeframe}
                    onTimeframeChange={props.onTimeframeChange}
                    onToggleFavorite={props.onToggleFavorite}
                    onAddCustomTimeframe={onAddCustomTimeframe}
                    onLogout={props.onLogout}
                    headerOhlc={headerOhlc}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={undoStack.length > 0}
                    canRedo={redoStack.length > 0}
                    onToggleIndicators={() => setIndicatorPanelOpen(true)}
                    chartType={chartType}
                    onToggleChartType={() => {
                        commitCurrentState();
                        setChartType((t) => (t === 'Candle' ? 'Line' : 'Candle'));
                    }}
                    onSaveLayout={() => {
                        // Manual save immediately
                        saveMarketState({ symbol, timeframe: activeTimeframe });
                        saveDrawings(symbol, activeTimeframe, drawings);
                    }}
                    onToggleSettings={() => setSettingsModalOpen(true)}
                    onToggleFullscreen={() => {
                        if (!document.fullscreenElement) {
                            fullscreenContainerRef.current?.requestFullscreen();
                        } else {
                            document.exitFullscreen();
                        }
                    }}
                    onTakeSnapshot={handleCopyChart}
                    isMobile={isMobile}
                    onToggleMobileSidebar={onToggleMobileSidebar}
                    precision={chartSettings.symbol.precision}
                />
                <div className="flex-1 flex min-h-0 relative">
                    {/* LeftToolbar removed - drawing tools moved to BottomPanel */}

                    <div
                        ref={eventContainerRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerLeave}
                        onWheel={handleWheel}
                        onDoubleClick={handleDoubleClick}
                        onContextMenu={handleContextMenu}
                        className={`flex-1 flex flex-col min-w-0 relative ${activeTool || placingOrderLine ? 'cursor-crosshair' : 'cursor-default'}`}
                        tabIndex={0}
                    >
                        <div className="flex-1 flex flex-col min-h-0 relative">
                            <div className="flex-1 flex min-h-0 relative">
                                <div className="flex-1 min-w-0 relative" ref={chartContainerRef}>
                                    <canvas
                                        ref={chartCanvasRef}
                                        className="absolute inset-0 w-full h-full block"
                                    />
                                    <svg
                                        ref={svgRef}
                                        className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
                                    >
                                        <defs>
                                            <filter
                                                id="selectionGlow"
                                                x="-50%"
                                                y="-50%"
                                                width="200%"
                                                height="200%"
                                            >
                                                <feGaussianBlur
                                                    stdDeviation="3"
                                                    result="coloredBlur"
                                                    in="SourceGraphic"
                                                />
                                                <feMerge>
                                                    <feMergeNode in="coloredBlur" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                        </defs>
                                        {renderDrawingsAndOverlays()}
                                        {tooltip.visible &&
                                            chartSettings.scalesAndLines.showCrosshair && (
                                                <g className="pointer-events-none">
                                                    <line
                                                        x1={0}
                                                        y1={tooltip.y}
                                                        x2={chartDimensions.width}
                                                        y2={tooltip.y}
                                                        stroke={
                                                            chartSettings.scalesAndLines
                                                                .crosshairColor
                                                        }
                                                        strokeWidth="1"
                                                        strokeDasharray="4 4"
                                                    />
                                                    <line
                                                        x1={tooltip.x}
                                                        y1={0}
                                                        x2={tooltip.x}
                                                        y2={chartDimensions.height}
                                                        stroke={
                                                            chartSettings.scalesAndLines
                                                                .crosshairColor
                                                        }
                                                        strokeWidth="1"
                                                        strokeDasharray="4 4"
                                                    />
                                                </g>
                                            )}
                                        {snapIndicator && (
                                            <circle
                                                cx={snapIndicator.x}
                                                cy={snapIndicator.y}
                                                r="4"
                                                fill="none"
                                                stroke="#c4b5f0"
                                                strokeWidth="2"
                                                className="pointer-events-none"
                                            />
                                        )}
                                    </svg>

                                    {/* Kuri table overlays */}
                                    {kuriTables.length > 0 && (
                                        <KuriTableOverlay tables={kuriTables} />
                                    )}

                                    {selectedDrawingId && floatingToolbarPos && (
                                        <FloatingDrawingToolbar
                                            drawing={
                                                drawings.find((d) => d.id === selectedDrawingId)!
                                            }
                                            position={floatingToolbarPos}
                                            setPosition={(pos) => {
                                                setFloatingToolbarPos(pos);
                                                savedToolbarPos.current = pos;
                                                localStorage.setItem(
                                                    'drawingToolbarPos',
                                                    JSON.stringify(pos)
                                                );
                                            }}
                                            onUpdateStyle={(s) =>
                                                commitDrawingChange((prev) =>
                                                    prev.map((d) =>
                                                        d.id === selectedDrawingId
                                                            ? { ...d, style: s }
                                                            : d
                                                    )
                                                )
                                            }
                                            onDelete={() => handleDeleteDrawing(selectedDrawingId)}
                                            onAlert={() =>
                                                handleCreateDrawingAlert(
                                                    drawings.find(
                                                        (d) => d.id === selectedDrawingId
                                                    )!
                                                )
                                            }
                                            onClone={handleCloneDrawing}
                                            onUpdateDrawing={handleUpdateDrawing}
                                            onDragEnd={(pos) => {
                                                savedToolbarPos.current = pos;
                                                localStorage.setItem(
                                                    'drawingToolbarPos',
                                                    JSON.stringify(pos)
                                                );
                                                api.updateUserSettings({ drawingToolbarPos: pos });
                                            }}
                                        />
                                    )}

                                    <AlertMarkers
                                        alerts={alerts}
                                        drawings={drawings}
                                        yScale={yScale}
                                        timeToX={timeToX}
                                        data={data}
                                        chartHeight={chartDimensions.height}
                                        currentPrice={headerOhlc?.close}
                                        activeDrawingOverride={
                                            interaction.type === 'moving' ||
                                            interaction.type === 'resizing'
                                                ? drawings.find(
                                                      (d) => d.id === interaction.drawingId
                                                  )
                                                : null
                                        }
                                        onEditAlert={handleEditAlert}
                                    />

                                    {editingText &&
                                        (() => {
                                            const isCallout =
                                                editingText.drawing.type === 'Callout';
                                            const fontSize =
                                                editingText.drawing.style.fontSize || 14;
                                            const lines = editingText.drawing.text.split('\n');
                                            const maxLineLen = Math.max(
                                                ...lines.map((l) => l.length),
                                                6
                                            );
                                            const edW = Math.max(
                                                maxLineLen * (fontSize * 0.62) + 32,
                                                120
                                            );
                                            const edH = Math.max(
                                                lines.length * (fontSize * 1.5) + 24,
                                                fontSize + 28
                                            );
                                            const edX = isCallout
                                                ? editingText.x
                                                : editingText.x + 10;
                                            const edY = isCallout
                                                ? editingText.y
                                                : editingText.y - edH;
                                            return (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        left: edX,
                                                        top: edY,
                                                        width: edW,
                                                        zIndex: 50,
                                                    }}
                                                >
                                                    {/* Accent bar for text note */}
                                                    {!isCallout && (
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                left: 0,
                                                                top: 0,
                                                                bottom: 0,
                                                                width: 3,
                                                                background: '#c4b5f0',
                                                                borderRadius: '6px 0 0 6px',
                                                            }}
                                                        />
                                                    )}
                                                    <textarea
                                                        ref={(el) => {
                                                            textInputRef.current = el;
                                                            if (el && !el.dataset.focused) {
                                                                el.dataset.focused = '1';
                                                                requestAnimationFrame(() => {
                                                                    el.focus();
                                                                    if (el.value === 'Note...') {
                                                                        el.select();
                                                                    }
                                                                });
                                                            }
                                                        }}
                                                        title="Edit annotation"
                                                        placeholder="Type here..."
                                                        value={editingText.drawing.text}
                                                        style={{
                                                            width: '100%',
                                                            height: edH,
                                                            padding: isCallout
                                                                ? '8px 14px'
                                                                : '10px 12px 10px 14px',
                                                            color: '#eae6f4',
                                                            fontSize,
                                                            fontWeight: 600,
                                                            fontFamily:
                                                                '"Inter","SF Pro Display",-apple-system,sans-serif',
                                                            background: '#1e1b2e',
                                                            border: '1.5px solid #c4b5f0',
                                                            borderRadius: isCallout ? 8 : 6,
                                                            outline: 'none',
                                                            resize: 'none',
                                                            overflow: 'hidden',
                                                            lineHeight: 1.5,
                                                            boxShadow:
                                                                '0 0 12px rgba(196,181,240,0.25), 0 4px 16px rgba(0,0,0,0.5)',
                                                            textAlign: isCallout
                                                                ? 'center'
                                                                : 'left',
                                                        }}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setEditingText((prev) =>
                                                                prev
                                                                    ? {
                                                                          ...prev,
                                                                          drawing: {
                                                                              ...prev.drawing,
                                                                              text: val,
                                                                          },
                                                                      }
                                                                    : null
                                                            );
                                                            setDrawings((prev) =>
                                                                prev.map((d) =>
                                                                    d.id === editingText.drawing.id
                                                                        ? ({
                                                                              ...d,
                                                                              text: val,
                                                                          } as any)
                                                                        : d
                                                                )
                                                            );
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                commitCurrentState();
                                                                setEditingText(null);
                                                            } else if (e.key === 'Escape') {
                                                                e.preventDefault();
                                                                setEditingText(null);
                                                            }
                                                            e.stopPropagation();
                                                        }}
                                                        onBlur={() => {
                                                            commitCurrentState();
                                                            setEditingText(null);
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })()}

                                    {/* Chart Navigation - visible on all devices now */}
                                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 opacity-0 hover:opacity-100 transition-opacity duration-300 p-6 pointer-events-none">
                                        <div className="pointer-events-auto">
                                            <ChartNavigation
                                                onZoom={(dir) =>
                                                    setView((v) =>
                                                        getClampedViewState(
                                                            v.startIndex,
                                                            v.visibleCandles * (dir > 0 ? 0.9 : 1.1)
                                                        )
                                                    )
                                                }
                                                onPan={(dir) =>
                                                    setView((v) =>
                                                        getClampedViewState(
                                                            v.startIndex + dir * 5,
                                                            v.visibleCandles
                                                        )
                                                    )
                                                }
                                                onReset={resetView}
                                                canPanToOlderData={view.startIndex > 0}
                                                canPanToNewerData={
                                                    view.startIndex <
                                                    data.length - view.visibleCandles
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div
                                    className="w-16 flex-shrink-0 border-l border-[#2A2A2A] cursor-ns-resize"
                                    ref={yAxisContainerRef}
                                >
                                    <canvas ref={yAxisCanvasRef} className="w-full h-full block" />
                                </div>

                                {rightPanel &&
                                    (isMobile ? (
                                        <>
                                            <div
                                                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                                                onClick={() => setRightPanel(null)}
                                            />
                                            <div
                                                className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f] border-t border-[#2A2A2A] rounded-t-xl shadow-2xl flex flex-col transition-all duration-75 ease-out"
                                                ref={(el) => {
                                                    if (el)
                                                        el.style.height = `${mobilePanelHeight}px`;
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div
                                                    className="w-full h-6 flex items-center justify-center cursor-ns-resize touch-none border-b border-[#2A2A2A] flex-shrink-0 hover:bg-[#2C2C2C]/50 transition-colors"
                                                    onPointerDown={handleMobilePanelResizeStart}
                                                >
                                                    <div className="w-12 h-1.5 bg-[#363636] rounded-full" />
                                                </div>
                                                <div className="flex-1 min-h-0 relative">
                                                    <SidePanels
                                                        panel={rightPanel}
                                                        onClose={() => setRightPanel(null)}
                                                        hoveredCandle={headerOhlc}
                                                        symbol={props.symbol}
                                                        onSymbolSelect={props.onSymbolChange}
                                                        drawings={drawings}
                                                        indicators={allActiveIndicators}
                                                        onDeleteDrawing={handleDeleteDrawing}
                                                        onToggleDrawingVisibility={
                                                            handleToggleDrawingVisibility
                                                        }
                                                        onDeleteIndicator={handleRemoveIndicator}
                                                        onToggleIndicatorVisibility={
                                                            handleToggleIndicatorVisibility
                                                        }
                                                        currentPrice={headerOhlc?.close || 0}
                                                        order={order}
                                                        setOrder={setOrder}
                                                        placingOrderLine={placingOrderLine}
                                                        onPlaceLine={setPlacingOrderLine}
                                                        onExecuteOrder={handleExecuteOrder}
                                                        assetType={
                                                            assetType === 'Binance'
                                                                ? 'Crypto'
                                                                : 'Forex'
                                                        }
                                                        forexAccountBalance={forexBalanceValue}
                                                        cryptoAccountBalance={binanceBalanceValue}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            className="bg-[#1E1E1E] border-l border-[#2A2A2A] flex-shrink-0 relative"
                                            ref={(el) => {
                                                if (el) el.style.width = `${rightPanelWidth}px`;
                                            }}
                                        >
                                            <div
                                                onPointerDown={handleResizePointerDown}
                                                className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-10"
                                            />
                                            <SidePanels
                                                panel={rightPanel}
                                                onClose={() => setRightPanel(null)}
                                                hoveredCandle={headerOhlc}
                                                symbol={props.symbol}
                                                onSymbolSelect={props.onSymbolChange}
                                                drawings={drawings}
                                                indicators={allActiveIndicators}
                                                onDeleteDrawing={handleDeleteDrawing}
                                                onToggleDrawingVisibility={
                                                    handleToggleDrawingVisibility
                                                }
                                                onDeleteIndicator={handleRemoveIndicator}
                                                onToggleIndicatorVisibility={
                                                    handleToggleIndicatorVisibility
                                                }
                                                currentPrice={headerOhlc?.close || 0}
                                                order={order}
                                                setOrder={setOrder}
                                                placingOrderLine={placingOrderLine}
                                                onPlaceLine={setPlacingOrderLine}
                                                onExecuteOrder={handleExecuteOrder}
                                                assetType={
                                                    assetType === 'Binance' ? 'Crypto' : 'Forex'
                                                }
                                                forexAccountBalance={forexBalanceValue}
                                                cryptoAccountBalance={binanceBalanceValue}
                                            />
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div
                            ref={indicatorPanelsContainerRef}
                            className="flex-shrink-0 overflow-hidden"
                        >
                            {panelIndicators
                                .filter((i) => i.isVisible !== false)
                                .map((indicator) => (
                                    <div
                                        key={indicator.id}
                                        className="h-40 border-t-2 border-[#2A2A2A] flex overflow-hidden"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <canvas
                                                ref={(el) => {
                                                    const currentRefs =
                                                        indicatorCanvasRefs.current.get(
                                                            indicator.id
                                                        ) || { chart: null, yAxis: null };
                                                    indicatorCanvasRefs.current.set(indicator.id, {
                                                        ...currentRefs,
                                                        chart: el,
                                                    });
                                                }}
                                                className="w-full h-full block"
                                            />
                                        </div>
                                        <div className="w-16 flex-shrink-0 border-l border-[#2A2A2A]">
                                            <canvas
                                                ref={(el) => {
                                                    const currentRefs =
                                                        indicatorCanvasRefs.current.get(
                                                            indicator.id
                                                        ) || { chart: null, yAxis: null };
                                                    if (el) {
                                                        indicatorCanvasRefs.current.set(
                                                            indicator.id,
                                                            { ...currentRefs, yAxis: el }
                                                        );
                                                    }
                                                }}
                                                className="w-full h-full block"
                                            />
                                        </div>
                                        {!isMobile && rightPanel && (
                                            <div
                                                ref={(el) => {
                                                    if (el) el.style.width = `${rightPanelWidth}px`;
                                                }}
                                                className="flex-shrink-0 bg-[#0f0f0f] border-l border-[#2A2A2A]"
                                            />
                                        )}
                                    </div>
                                ))}
                        </div>
                        <div className="h-[32px] flex border-t border-[#2A2A2A] flex-shrink-0">
                            <div
                                className="flex-1 cursor-ew-resize overflow-hidden"
                                ref={xAxisContainerRef}
                            >
                                <canvas ref={xAxisCanvasRef} className="w-full h-full block" />
                            </div>
                            <div className="w-16 flex-shrink-0 border-l border-[#2A2A2A] bg-[#0f0f0f] flex items-center justify-center">
                                <button
                                    onClick={() => setSettingsModalOpen(true)}
                                    className="text-[#E0E0E0] hover:text-[#FFFFFF] transition-colors"
                                    title="Chart Settings"
                                >
                                    <SettingsIcon className="w-4 h-4" />
                                </button>
                            </div>
                            {!isMobile && rightPanel && (
                                <div
                                    ref={(el) => {
                                        if (el) el.style.width = `${rightPanelWidth}px`;
                                    }}
                                    className="flex-shrink-0 bg-[#0f0f0f] border-l border-[#2A2A2A]"
                                />
                            )}
                        </div>
                        {isBottomPanelOpen && (
                            <BottomPanel
                                isOpen={isBottomPanelOpen}
                                onToggle={handleToggleBottomPanel}
                                activeTab={bottomPanelTab}
                                setActiveTab={setBottomPanelTab}
                                currentTime={currentTime}
                                symbol={symbol}
                                height={bottomPanelHeight}
                                setHeight={setBottomPanelHeight}
                                positions={positions}
                                onModifyPosition={handleModifyPosition}
                                onClosePosition={handleClosePosition}
                                onCancelOrder={handleCancelOrder}
                                onReversePosition={handleReversePosition}
                                isMobile={isMobile}
                                onToolAction={handleToolAction}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                canUndo={undoStack.length > 0}
                                canRedo={redoStack.length > 0}
                                consoleLogs={consoleLogs}
                                onClearConsole={clearConsoleLogs}
                            />
                        )}
                        <ActiveIndicatorsDisplay
                            indicators={allActiveIndicators}
                            onEdit={setIndicatorToEdit}
                            onRemove={handleRemoveIndicator}
                            onToggleVisibility={handleToggleIndicatorVisibility}
                            onToggleAllVisibility={handleToggleAllIndicatorsVisibility}
                            onCreateAlert={handleCreateIndicatorAlert}
                        />
                    </div>
                    {!isMobile && (
                        <RightToolbar
                            onTogglePanel={(panel) =>
                                setRightPanel((p) => (p === panel ? null : panel))
                            }
                            onTogglePositions={handleToggleBottomPanel}
                            isPositionsOpen={isBottomPanelOpen}
                            onToggleConsole={handleToggleConsole}
                            isConsoleOpen={isBottomPanelOpen && bottomPanelTab === 'Console'}
                            consoleErrorCount={
                                consoleLogs.filter((l) => l.level === 'error').length
                            }
                            drawingTools={tools}
                            activeTool={activeTool}
                            onToolSelect={setActiveTool}
                        />
                    )}
                </div>

                {isIndicatorPanelOpen && (
                    <IndicatorPanel
                        isOpen={isIndicatorPanelOpen}
                        onClose={() => setIndicatorPanelOpen(false)}
                        onAdd={handleAddIndicator}
                        customScripts={props.customScripts}
                        onAddCustom={handleAddCustomIndicator}
                        strategyVisibility={strategyVisibility}
                        onToggleStrategy={onToggleStrategyVisibility}
                    />
                )}
                {indicatorToEdit && (
                    <IndicatorSettingsModal
                        indicator={indicatorToEdit}
                        onClose={() => setIndicatorToEdit(null)}
                        onSave={handleUpdateIndicator}
                    />
                )}
                {isSettingsModalOpen && (
                    <ChartSettingsModal
                        settings={chartSettings}
                        onClose={() => setSettingsModalOpen(false)}
                        onSave={handleSaveSettings}
                    />
                )}

                {alertModalInfo.visible &&
                    (!!alertModalInfo.drawing || !!alertModalInfo.indicatorId) && (
                        <CreateAlertModal
                            symbol={props.symbol}
                            drawing={
                                alertModalInfo.drawing || ({ type: 'Horizontal Line' } as Drawing)
                            }
                            initialAlert={alertModalInfo.alertToEdit}
                            indicatorId={alertModalInfo.indicatorId}
                            indicatorType={alertModalInfo.indicatorType}
                            onClose={() =>
                                setAlertModalInfo({
                                    visible: false,
                                    drawing: null,
                                    alertToEdit: null,
                                })
                            }
                            onCreate={handleCreateAlertFromModal}
                        />
                    )}
                {contextMenu?.visible && (
                    <ContextMenu
                        {...contextMenu}
                        symbol={props.symbol}
                        lockedTime={lockedVerticalLineTime}
                        onClose={() => setContextMenu(null)}
                        onAddAlert={(price) => {
                            // For simple price alert, we might want to create a temporary horizontal line or update Modal to support pure price alerts
                            // For now, let's create a temporary invisible horizontal line?
                            // Or better: Modify Modal to be more flexible.
                            // Assuming Modal requires drawing for now based on previous code.
                            // Actually, let's verify CreateAlertModal props.
                            console.log('Add simple alert at', price);
                        }}
                        onAddDrawingAlert={handleCreateDrawingAlert}
                        onOpenSettings={() => setSettingsModalOpen(true)}
                        onLockVerticalLine={onLockVerticalLine}
                        onCopyChart={handleCopyChart}
                        onRemoveDrawings={handleRemoveAllDrawings}
                        onRemoveIndicators={handleRemoveAllIndicators}
                        onOpenObjectTree={() => setRightPanel('objectTree')}
                        onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
                        drawing={contextMenu.drawing}
                    />
                )}

                <TemplateManagerModal
                    isOpen={isTemplateManagerOpen}
                    onClose={() => setIsTemplateManagerOpen(false)}
                    templates={getChartTemplates()}
                    onLoad={handleLoadTemplate}
                    onDelete={handleDeleteTemplate}
                    onSave={handleSaveTemplate}
                />

                <MobileDrawingToolsModal
                    isOpen={isMobileDrawingModalOpen}
                    onClose={() => setMobileDrawingModalOpen(false)}
                    tools={tools}
                    onSelect={setActiveTool}
                />

                <MobileMoreMenu
                    isOpen={isMobileMoreMenuOpen}
                    onClose={() => setMobileMoreMenuOpen(false)}
                    onAction={(action) => {
                        setRightPanel(action as any);
                        setMobileMoreMenuOpen(false);
                    }}
                />
            </div>
        </>
    );
};

export default CandlestickChart;
