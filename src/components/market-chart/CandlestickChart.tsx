import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Position, PositionStatus, TradeDirection, Metric, Strategy } from '../../types';
import CreateAlertModal from '../CreateAlertModal';
import * as api from '../../api';
import indicatorService from '../../services/indicatorService';
import * as priceAlertService from '../../services/alertService';
import { saveMarketState } from '../../services/marketStateService';
import { saveDrawings } from '../../services/chartDrawingService';
import { alertEngine } from '../../engine/alertEngine';
import { useOutsideAlerter } from './hooks';
import {
    Candle, Drawing, CurrentDrawingState, PriceAlert, TooltipData, ViewState, PriceRange, InteractionState,
    Indicator, IndicatorType, IndicatorSettings, Point, TextNoteDrawing, DrawingStyle, HorizontalLineDrawing,
    CurrentDrawing, ChartSettings, RectangleDrawing, AlertConditionType, OrderDetails, PlacingOrderLine,
    VerticalLineDrawing, ArrowDrawing, CalloutDrawing, PathDrawing, BrushDrawing, LongPositionDrawing,
    ShortPositionDrawing, PriceRangeDrawing, DateRangeDrawing, DatePriceRangeDrawing, TrendLineDrawing,
    RayDrawing, ParallelChannelDrawing, HorizontalRayDrawing, GannBoxDrawing, FibonacciRetracementDrawing
} from './types';
import { MIN_CANDLES, RIGHT_SIDE_PADDING_CANDLES, HITBOX_WIDTH, HANDLE_RADIUS, SNAP_THRESHOLD, FIB_LEVELS, GANN_LEVELS, GANN_LEVEL_COLORS } from './constants';
import { calculateSMA, calculateRSI, calculateEMA, calculateBollingerBands, calculateMACD, calculateStochastic, calculateSuperTrend, calculateVWAP, calculateCCI, calculateMFI, calculateOBV, calculateMARibbon } from './helpers';
import ChartHeader from './ChartHeader';
import LeftToolbar from './LeftToolbar';
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
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, WatchlistIcon, IndicatorIcon, MoreHorizontalIcon, CloseIcon, SettingsIcon } from '../IconComponents';
import { AlertMarkers } from './AlertMarkers'; // Import AlertMarkers
import { MobileDrawingToolsModal, MobileMoreMenu } from './mobile';
import { useResponsive } from '../../hooks/useResponsive';
import { getIndicatorDefinition } from '../../data/builtInIndicators';

const FIB_LEVEL_COLORS = [
    'rgba(128, 0, 128, 0.2)',    // Purple for 0-0.236
    'rgba(0, 0, 255, 0.2)',      // Blue for 0.236-0.382
    'rgba(0, 128, 0, 0.2)',      // Green for 0.382-0.5
    'rgba(255, 255, 0, 0.2)',   // Yellow for 0.5-0.618
    'rgba(255, 165, 0, 0.2)',   // Orange for 0.618-0.786
    'rgba(255, 0, 0, 0.2)',      // Red for 0.786-1
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
        showBody: true, showBorders: true, showWick: true, bodyUpColor: '#10B981', bodyDownColor: '#EF4444',
        borderUpColor: '#10B981', borderDownColor: '#EF4444', wickUpColor: '#10B981', wickDownColor: '#EF4444',
        colorBarsOnPrevClose: false, precision: 'Default', timezone: 'Etc/UTC',
    },
    statusLine: {
        showOhlc: true, showBarChange: true, showVolume: true, showIndicatorTitles: true, showIndicatorValues: true,
    },
    scalesAndLines: {
        showLastPriceLabel: true, showPriceLabels: true, gridColor: 'rgba(47, 47, 47, 0.5)', crosshairColor: '#A9A9A9',
        showCountdown: true, showGrid: true, showCrosshair: true,
        dateFormat: 'DD-MM-YYYY',
        timeFormat: 'hh:mm',
    },
    canvas: {
        backgroundType: 'solid', backgroundColor: '#000000', gradientStartColor: '#121212', gradientEndColor: '#000000',
        textColor: '#A9A9A9', showWatermark: false, watermarkText: symbol, watermarkColor: 'rgba(156, 163, 175, 0.1)',
    },
});

const getTextColorForBackground = (hexColor: string): string => {
    if (!hexColor || !hexColor.startsWith('#')) return '#FFFFFF';
    const hex = hexColor.slice(1);
    if (hex.length !== 6) return '#FFFFFF';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

const getDefaultIndicatorSettings = (type: IndicatorType): IndicatorSettings => {
    switch (type) {
        case 'MA': return { period: 14, color: '#3B82F6' };
        case 'EMA': return { period: 14, color: '#FBBF24' };
        case 'RSI': return { period: 14, color: '#A78BFA' };
        case 'BB': return { period: 20, stdDev: 2, upperColor: '#2962FF', middleColor: '#FF6D00', lowerColor: '#2962FF' };
        case 'MACD': return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, macdColor: '#2962FF', signalColor: '#FF6D00', histogramUpColor: '#4CAF50', histogramDownColor: '#F44336' };
        case 'Stochastic': return { kPeriod: 14, kSlowing: 3, dPeriod: 3, kColor: '#2962FF', dColor: '#FF6D00' };
        case 'SuperTrend': return { atrPeriod: 10, factor: 3, upColor: '#4CAF50', downColor: '#F44336' };
        case 'VWAP': return { color: '#EC4899' };
        case 'MA Ribbon': return { ribbonPeriods: "10,20,30,40,50,60", ribbonBaseColor: '#2962FF' };
        case 'CCI': return { period: 20, color: '#FBBF24' };
        case 'Volume': return { volumeUpColor: '#10B981', volumeDownColor: '#EF4444' };
        case 'MFI': return { period: 14, color: '#3B82F6' };
        case 'OBV': return { color: '#10B981' };
        default: return {};
    }
};

const calculateIndicatorData = (indicator: Indicator, data: Candle[]) => {
    switch (indicator.type) {
        case 'MA': return { main: calculateSMA(data.map(c => c.close), indicator.settings.period || 14) };
        case 'EMA': return { main: calculateEMA(data.map(c => c.close), indicator.settings.period || 14) };
        case 'RSI': return calculateRSI(data, indicator.settings.period || 14);
        case 'BB': return calculateBollingerBands(data, indicator.settings.period || 20, indicator.settings.stdDev || 2);
        case 'MACD': return calculateMACD(data, indicator.settings.fastPeriod || 12, indicator.settings.slowPeriod || 26, indicator.settings.signalPeriod || 9);
        case 'Stochastic': return calculateStochastic(data, indicator.settings.kPeriod || 14, indicator.settings.kSlowing || 3, indicator.settings.dPeriod || 3);
        case 'SuperTrend': return calculateSuperTrend(data, indicator.settings.atrPeriod || 10, indicator.settings.factor || 3);
        case 'VWAP': return calculateVWAP(data);
        case 'CCI': return calculateCCI(data, indicator.settings.period || 20);
        case 'MFI': return calculateMFI(data, indicator.settings.period || 14);
        case 'OBV': return calculateOBV(data);
        case 'Volume': return { main: data.map(c => c.volume || 0) };
        case 'MA Ribbon': return calculateMARibbon(data, indicator.settings.ribbonPeriods);
        default: return {};
    }
};

// Helper function to feed indicator values to AlertEngine
const feedIndicatorToAlertEngine = (indicator: Indicator) => {
    try {
        // Get the latest values from indicator data
        const latestValues: Record<string, number | null> = {};

        // Generic data extraction for ALL indicators
        const keys = Object.keys(indicator.data);
        keys.forEach(key => {
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
        if (indicatorDef && indicatorDef.alertConditions) {
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
    onOpenAssistant?: () => void;
}

const CandlestickChart: React.FC<CandlestickChartProps> = (props) => {
    const { data, tools, symbol, activeTimeframe, onSymbolChange, onAddCustomTimeframe, onToggleMobileSidebar, initialSettings, onSettingsChange, strategyVisibility, onToggleStrategyVisibility, customScripts = [], initialDrawings, onDrawingsChange } = props;
    const svgRef = useRef<SVGSVGElement>(null);
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
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
    const tapDetectionRef = useRef<{ x: number; y: number; time: number; wasVisible: boolean } | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { isMobile } = useResponsive();

    const [isMobileDrawingModalOpen, setMobileDrawingModalOpen] = useState(false);
    const [isMobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);

    const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
    const [yAxisDimensions, setYAxisDimensions] = useState({ width: 0, height: 0 });
    const [xAxisDimensions, setXAxisDimensions] = useState({ width: 0, height: 0 });

    const [view, setView] = useState<ViewState>({ startIndex: Math.max(0, data.length - 60), visibleCandles: Math.min(60, data.length) });
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

    const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

    const [bottomPanelTab, setBottomPanelTab] = useState('Positions');
    const [isBottomPanelOpen, setBottomPanelOpen] = useState(true);

    const [priceRange, setPriceRange] = useState<PriceRange>({ min: 0, max: 0 });
    const [isAutoScaling, setIsAutoScaling] = useState(true);
    const [headerOhlc, setHeaderOhlc] = useState<Candle | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    const [alerts, setAlerts] = useState<PriceAlert[]>([]);

    const [editingText, setEditingText] = useState<{ drawing: TextNoteDrawing | CalloutDrawing, x: number, y: number } | null>(null);
    const [snapIndicator, setSnapIndicator] = useState<{ x: number, y: number } | null>(null);
    const [rightPanel, setRightPanel] = useState<'watchlist' | 'alerts' | 'dataWindow' | 'orderPanel' | 'objectTree' | 'assistant' | null>(null);
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
    const indicatorCanvasRefs = useRef<Map<string, { chart: HTMLCanvasElement | null, yAxis: HTMLCanvasElement | null }>>(new Map());

    const [floatingToolbarPos, setFloatingToolbarPos] = useState<{ x: number; y: number } | null>(null);
    const [chartType, setChartType] = useState<'Candle' | 'Line'>('Candle');
    const [countdown, setCountdown] = useState<string | null>(null);

    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number; time: number; visible: boolean; drawing?: Drawing } | null>(null);

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
                return {
                    symbol: { ...defaults.symbol, ...savedSettings.symbol },
                    statusLine: { ...defaults.statusLine, ...savedSettings.statusLine },
                    scalesAndLines: { ...defaults.scalesAndLines, ...savedSettings.scalesAndLines },
                    canvas: { ...defaults.canvas, ...savedSettings.canvas },
                };
            }
        } catch (error) {
            console.error("Failed to load chart settings:", error);
        }
        return defaults;
    });

    // Update settings when prop changes (external load)
    useEffect(() => {
        if (initialSettings) {
            setChartSettings(prev => {
                // simple deep comparison or just overwrite?
                // Overwrite safely merging with defaults to ensure completeness
                const defaults = getDefaultChartSettings(symbol);
                return {
                    symbol: { ...defaults.symbol, ...initialSettings.symbol },
                    statusLine: { ...defaults.statusLine, ...initialSettings.statusLine },
                    scalesAndLines: { ...defaults.scalesAndLines, ...initialSettings.scalesAndLines },
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
        postOnly: false
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
            const newHeight = Math.max(100, Math.min(window.innerHeight * 0.9, startHeight + deltaY));
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

                const forexBalanceStr = forexMetrics.find(m => m.title.toLowerCase().includes('balance'))?.value || '0';
                setForexBalanceValue(parseFloat(forexBalanceStr.replace(/[^0-9.-]+/g, "")));

                const binanceBalanceStr = binanceMetrics.find(m => m.title.toLowerCase().includes('balance'))?.value || '0';
                setBinanceBalanceValue(parseFloat(binanceBalanceStr.replace(/[^0-9.-]+/g, "")));

                setPositions(posData);
            } catch (error) {
                console.error("Failed to load chart-related data:", error);
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

        setAllActiveIndicators(currentIndicators => {
            // 1. Identify persistent (manual) indicators vs strategy indicators
            // Fix: Recalculate data for manual indicators as well to support Timeframe switches
            const manualIndicators = currentIndicators
                .filter(ind => !ind.id.startsWith('strategy_'))
                .map(ind => ({
                    ...ind,
                    data: calculateIndicatorData(ind, data)
                }));

            // 2. Build list of desired strategy indicators
            const strategyIndicators: Indicator[] = [];

            customScripts.forEach(strategy => {
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
                            ...config.parameters
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
                            isVisible: true
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
    useEffect(() => {
        const loadIndicators = async () => {
            const dbIndicators = await indicatorService.fetchUserIndicators(props.symbol, props.activeTimeframe);
            if (dbIndicators.length > 0) {
                // Calculate data for loaded indicators
                const indicatorsWithData = dbIndicators.map(ind => ({
                    ...ind,
                    data: calculateIndicatorData(ind, data)
                }));
                setAllActiveIndicators(prev => {
                    const fetchedMap = new Map(indicatorsWithData.map(i => [i.id, i]));
                    // Keep existing indicators if they are NOT in the fetched set (preserves newly saved ones)
                    // Since we clear on symbol change, anything here is likely user-added
                    const preserved = prev.filter(p => !fetchedMap.has(p.id));

                    // But we must prioritize the fetched version if it exists (to get correct data/settings from DB source)
                    // Actually, for consistency, let's use fetched + unique local
                    return [...indicatorsWithData, ...preserved];
                });
            }
            setIndicatorsLoaded(true);
        };

        loadIndicators();
    }, [props.symbol, props.activeTimeframe]); // Only reload when symbol/timeframe changes

    // Debounce indicator saves to database
    useEffect(() => {
        if (!indicatorsLoaded) return; // Don't save during initial load

        const timeoutId = setTimeout(async () => {
            // Filter out strategy indicators (they're managed by strategy visibility)
            const manualIndicators = allActiveIndicators.filter(ind => !ind.id.startsWith('strategy_'));

            // Note: This is a simplified approach - ideally track individual changes
            // For now, we rely on handlers below to save individual changes
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [allActiveIndicators, indicatorsLoaded]);


    const overlayIndicators = useMemo(() => allActiveIndicators.filter(i => ['BB', 'SMA', 'EMA', 'SuperTrend', 'MA', 'MA Ribbon', 'VWAP'].includes(i.type)), [allActiveIndicators]);
    const panelIndicators = useMemo(() => allActiveIndicators.filter(i => !['BB', 'SMA', 'EMA', 'SuperTrend', 'MA', 'MA Ribbon', 'VWAP'].includes(i.type)), [allActiveIndicators]);

    const assetType: 'Forex' | 'Binance' = useMemo(() => {
        const upperSymbol = props.symbol.toUpperCase();
        if (upperSymbol.includes('USDT') || upperSymbol.includes('BTC') || upperSymbol.includes('ETH')) {
            return 'Binance';
        }
        return 'Forex';
    }, [props.symbol]);

    const openPositions = useMemo(() => {
        const normalizedSymbol = props.symbol.replace('/', '').toUpperCase();
        return positions.filter(p =>
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
            chartType
        };
        setUndoStack(prev => [...prev.slice(-49), currentState]); // Limit to 50
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
        const currentState: HistoryState = { drawings, indicators: allActiveIndicators, view, priceRange, isAutoScaling, chartType };
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
            chartType
        };
        const previousState = undoStack[undoStack.length - 1];

        setRedoStack(prev => [currentState, ...prev]);
        setUndoStack(prev => prev.slice(0, -1));

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
            chartType
        };
        const nextState = redoStack[0];

        setUndoStack(prev => [...prev, currentState]);
        setRedoStack(prev => prev.slice(1));

        setDrawings(nextState.drawings);
        setAllActiveIndicators(nextState.indicators);
        setView(nextState.view);
        setPriceRange(nextState.priceRange);
        setIsAutoScaling(nextState.isAutoScaling);
        setChartType(nextState.chartType);
    };




    const commitDrawingChange = (updater: (prev: Drawing[]) => Drawing[]) => {
        commitStateAndApplyChanges(prevState => ({
            ...prevState,
            drawings: updater(prevState.drawings)
        }));
    };




    const handleDeleteDrawing = (id: string) => {
        // Remove associated alerts
        const associatedAlerts = alerts.filter(a => a.drawingId === id);
        associatedAlerts.forEach(alert => {
            priceAlertService.deleteAlert(alert.id);
        });
        setAlerts(prev => prev.filter(a => a.drawingId !== id));

        commitDrawingChange(prev => prev.filter(d => d.id !== id));
        if (selectedDrawingId === id) setSelectedDrawingId(null);
    };

    const handleCloneDrawing = (id: string) => {
        const drawing = drawings.find(d => d.id === id);
        if (!drawing) return;
        const shiftPoint = (p: Point) => ({ time: p.time + (candleInterval || 3600), price: p.price });
        let newDrawing = { ...drawing, id: `d${Date.now()}` };

        if (newDrawing.type === 'Horizontal Line') {
            (newDrawing as HorizontalLineDrawing).price *= 1.001;
        } else if (newDrawing.type === 'Vertical Line') {
            (newDrawing as VerticalLineDrawing).time += (candleInterval || 3600);
        } else if (newDrawing.type === 'Text Note') {
            (newDrawing as TextNoteDrawing).point = shiftPoint((newDrawing as TextNoteDrawing).point);
        } else {
            if ('start' in newDrawing) (newDrawing as any).start = shiftPoint((newDrawing as any).start);
            if ('end' in newDrawing) (newDrawing as any).end = shiftPoint((newDrawing as any).end);
            // Fix: added explicit type assertion for points array to resolve TS error
            if ('points' in newDrawing) (newDrawing as any).points = ((newDrawing as any).points as any[]).map(shiftPoint);
        }
        commitDrawingChange(prev => [...prev, newDrawing as Drawing]);
    };

    const handleUpdateDrawing = (newDrawing: Drawing) => {
        commitDrawingChange(prev => prev.map(d => d.id === newDrawing.id ? newDrawing : d));
    };

    const handleToggleDrawingVisibility = (id: string) => {
        commitDrawingChange(prev => prev.map(d => d.id === id ? { ...d, isVisible: !(d.isVisible ?? true) } : d));
    };

    const handleAddIndicator = async (type: IndicatorType) => {
        commitCurrentState(); // Save state before adding indicator
        const newIndicator: Indicator = {
            id: `ind${Date.now()}`,
            type,
            settings: getDefaultIndicatorSettings(type),
            data: {},
            isVisible: true
        };
        newIndicator.data = calculateIndicatorData(newIndicator, data);

        // Feed to AlertEngine for indicator alerts
        feedIndicatorToAlertEngine(newIndicator);

        // Optimistic update
        commitStateAndApplyChanges(prev => ({ ...prev, indicators: [...prev.indicators, newIndicator] }));

        // Save to database (don't block UI)
        // Save to database (don't block UI)
        const saved = await indicatorService.saveIndicator(props.symbol, props.activeTimeframe, newIndicator);
        if (saved) {
            // Update with DB-generated ID
            commitStateAndApplyChanges(prev => ({
                ...prev,
                indicators: prev.indicators.map(i =>
                    i.id === newIndicator.id ? { ...i, id: saved.id } : i
                )
            }));
        }
    };

    const handleAddCustomIndicator = (script: Strategy) => {
        if (!script.indicators || script.indicators.length === 0) return;
        const newIndicators: Indicator[] = script.indicators.map((indData: any) => {
            const type = indData.type as IndicatorType;
            // Map settings
            const settings = { ...getDefaultIndicatorSettings(type), ...indData.parameters };
            const newInd: Indicator = {
                id: `ind${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                type,
                settings,
                data: {},
                isVisible: true
            };
            return newInd;
        });

        // Add to state and save
        newIndicators.forEach(feedIndicatorToAlertEngine);
        commitStateAndApplyChanges(prev => ({ ...prev, indicators: [...prev.indicators, ...newIndicators] }));

        // Save each one
        newIndicators.forEach(ind => indicatorService.saveIndicator(props.symbol, props.activeTimeframe, ind));
    };

    const handleCreateIndicatorAlert = (indicator: Indicator) => {
        setAlertModalInfo({
            visible: true,
            drawing: { type: 'Horizontal Line', price: 0 } as Drawing, // Dummy drawing to satisfy types if needed, or update Modal types
            indicatorId: indicator.id,
            indicatorType: indicator.type
        });
    };


    const handleRemoveIndicator = async (id: string) => {
        commitCurrentState(); // Save state before removing indicator
        // Optimistic update
        const indicatorToRemove = allActiveIndicators.find(i => i.id === id);
        commitStateAndApplyChanges(prev => ({ ...prev, indicators: prev.indicators.filter(i => i.id !== id) }));

        // Delete from database (don't block UI)
        // Delete from database (don't block UI)
        if (indicatorToRemove && !id.startsWith('ind')) {
            // Only delete if it has a database ID (not temp ID)
            await indicatorService.deleteIndicator(id);
        }
    };

    const handleToggleIndicatorVisibility = async (id: string) => {
        // Optimistic update
        commitStateAndApplyChanges(prev => ({
            ...prev,
            indicators: prev.indicators.map(i => i.id === id ? { ...i, isVisible: !i.isVisible } : i)
        }));

        // Save to database (don't block UI)
        // Save to database (don't block UI)
        if (!id.startsWith('ind') && !id.startsWith('strategy_')) {
            const indicator = allActiveIndicators.find(i => i.id === id);
            if (indicator) {
                await indicatorService.toggleIndicatorVisibility(id, !indicator.isVisible);
            }
        }
    };

    const handleToggleAllIndicatorsVisibility = (isVisible: boolean) => {
        commitStateAndApplyChanges(prev => ({
            ...prev,
            indicators: prev.indicators.map(i => ({ ...i, isVisible }))
        }));
    };

    const handleUpdateIndicator = async (id: string, newSettings: IndicatorSettings) => {
        // Optimistic update
        commitStateAndApplyChanges(prev => {
            const indicators = prev.indicators.map(i => {
                if (i.id === id) {
                    const updated = { ...i, settings: newSettings };
                    updated.data = calculateIndicatorData(updated, data);
                    return updated;
                }
                return i;
            });
            return { ...prev, indicators };
        });

        // Save to database (don't block UI)
        // Save to database (don't block UI)
        if (!id.startsWith('ind')) {
            await indicatorService.updateIndicator(id, { settings: newSettings });
        }
    };

    const handleRemoveAllDrawings = () => commitDrawingChange(() => []);
    const handleRemoveAllIndicators = () => commitStateAndApplyChanges(prev => ({ ...prev, indicators: [] }));

    const getChartTemplates = () => { try { return JSON.parse(localStorage.getItem('chartTemplates') || '{}'); } catch { return {}; } };
    const handleSaveTemplate = () => { const name = prompt("Enter template name:"); if (!name) return; const templates = getChartTemplates(); templates[name] = { drawings, indicators: allActiveIndicators }; localStorage.setItem('chartTemplates', JSON.stringify(templates)); alert("Template saved."); };
    const handleLoadTemplate = (name: string) => {
        const templates = getChartTemplates();
        if (templates[name]) {
            const { drawings: loadedDrawings, indicators: loadedIndicators } = templates[name];
            const indicatorsWithData = (loadedIndicators as any[]).map((ind: Indicator) => ({ ...ind, data: calculateIndicatorData(ind, data) }));
            commitStateAndApplyChanges(prev => ({ ...prev, drawings: loadedDrawings, indicators: indicatorsWithData }));
            setIsTemplateManagerOpen(false);
        }
    };
    const handleDeleteTemplate = (name: string) => { const templates = getChartTemplates(); delete templates[name]; localStorage.setItem('chartTemplates', JSON.stringify(templates)); };

    const getClampedViewState = (newStartIndex: number, newVisibleCandles: number): ViewState => {
        if (data.length === 0) {
            return { startIndex: 0, visibleCandles: Math.max(MIN_CANDLES, newVisibleCandles) };
        }

        const maxVisible = Math.max(data.length * 3, 500);
        const clampedVisibleCandles = Math.min(maxVisible, Math.max(MIN_CANDLES, newVisibleCandles));

        const rightPadding = Math.max(RIGHT_SIDE_PADDING_CANDLES, clampedVisibleCandles / 5);

        const effectiveMin = -rightPadding;
        const effectiveMax = data.length - 1;

        const clampedStartIndex = Math.max(effectiveMin, Math.min(effectiveMax, newStartIndex));

        return { startIndex: clampedStartIndex, visibleCandles: clampedVisibleCandles };
    };

    const handleSaveSettings = (newSettings: ChartSettings) => { setChartSettings(newSettings); try { localStorage.setItem(`chartSettings_${props.symbol}`, JSON.stringify(newSettings)); } catch (error) { console.error("Failed to save chart settings:", error); } setSettingsModalOpen(false); };
    const resetView = () => { commitCurrentState(); const newVisibleCandles = 60; const newStartIndex = Math.max(0, data.length - newVisibleCandles + RIGHT_SIDE_PADDING_CANDLES); setView({ startIndex: newStartIndex, visibleCandles: newVisibleCandles }); setIsAutoScaling(true); };
    const saveLayout = () => { try { const layout = { drawings, activeIndicators: allActiveIndicators }; localStorage.setItem(`chartLayout_${props.symbol}`, JSON.stringify(layout)); alert('Layout saved!'); } catch (error) { console.error('Failed to save layout:', error); alert('Failed to save layout.'); } };

    const coercePoint = (p: any): Point => ({
        time: typeof p?.time === 'number' ? p.time : 0,
        price: typeof p?.price === 'number' ? p.price : 0,
    });

    useEffect(() => {
        const initialVisibleCandles = 60;
        const initialStartIndex = Math.max(0, data.length - initialVisibleCandles + RIGHT_SIDE_PADDING_CANDLES);
        setView({ startIndex: initialStartIndex, visibleCandles: initialVisibleCandles });
        setIsAutoScaling(true);
        setUndoStack([]);
        setRedoStack([]);
        setSelectedDrawingId(null);
        setCurrentDrawing(null);
        // Legacy localStorage layout loading removed to prevent state reset race conditions.
        // Drawings and indicators are now managed via props (Supabase) in Market.tsx.
        setAllActiveIndicators([]); // Clear indicators on symbol change to avoid cross-pollination
    }, [props.symbol]); // Removed 'data' dependency to prevent reset on price update

    useEffect(() => { const chartContainer = chartContainerRef.current; const yAxisContainer = yAxisContainerRef.current; const xAxisContainer = xAxisContainerRef.current; if (!chartContainer || !yAxisContainer || !xAxisContainer) return; const chartObserver = new ResizeObserver(entries => { if (entries[0]) { const { width, height } = entries[0].contentRect; setChartDimensions({ width, height }); } }); const yAxisObserver = new ResizeObserver(entries => { if (entries[0]) { const { width, height } = entries[0].contentRect; setYAxisDimensions({ width, height }); } }); const xAxisObserver = new ResizeObserver(entries => { if (entries[0]) { const { width, height } = entries[0].contentRect; setXAxisDimensions({ width, height }); } }); chartObserver.observe(chartContainer); yAxisObserver.observe(yAxisContainer); xAxisObserver.observe(xAxisContainer); return () => { chartObserver.disconnect(); yAxisObserver.disconnect(); xAxisObserver.disconnect(); }; }, []);

    const xStep = useMemo(() => (chartDimensions.width > 0 && view.visibleCandles > 0) ? chartDimensions.width / view.visibleCandles : 0, [chartDimensions.width, view.visibleCandles]);
    const { firstIndexToRender, lastIndexToRender } = useMemo(() => { const start = Math.floor(view.startIndex); const end = Math.ceil(view.startIndex + view.visibleCandles); return { firstIndexToRender: start, lastIndexToRender: end }; }, [view.startIndex, view.visibleCandles]);
    const visibleData = useMemo(() => { if (data.length === 0) return []; const start = Math.max(0, firstIndexToRender); const end = Math.min(data.length, lastIndexToRender); return data.slice(start, end); }, [data, firstIndexToRender, lastIndexToRender]);
    const candleInterval = useMemo(() => { if (data.length < 2) { const TIMEFRAME_INTERVALS: { [key: string]: number } = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '45m': 2700, '1H': 3600, '2H': 7200, '3H': 10800, '4H': 14400, '1D': 86400, '1W': 604800, '1M': 2592000 }; return TIMEFRAME_INTERVALS[activeTimeframe] || 3600; } return data[1].time - data[0].time; }, [data, activeTimeframe]);
    const indexToX = useMemo(() => (index: number): number => (index + 0.5) * xStep, [xStep]);
    const xToIndex = useMemo(() => (x: number): number => { if (xStep <= 0) return 0; return Math.floor(x / xStep); }, [xStep]);
    const yScale = useMemo(() => { return (price: number) => { if (priceRange.max === priceRange.min) return chartDimensions.height / 2; return chartDimensions.height - ((price - priceRange.min) / (priceRange.max - priceRange.min)) * chartDimensions.height; } }, [chartDimensions.height, priceRange]);
    const yToPrice = useMemo(() => (y: number): number => { if (priceRange.max === priceRange.min) return priceRange.min; const chartHeight = chartDimensions.height; if (chartHeight <= 0) return 0; const priceRangeValue = priceRange.max - priceRange.min; const price = priceRange.max - (y / chartHeight) * priceRangeValue; return price; }, [chartDimensions.height, priceRange]);
    const timeToX = useMemo(() => (time: number): number => { if (!data || data.length === 0 || candleInterval <= 0 || !data[0]) return -100; const firstDataTime = data[0].time; const indexInData = (time - firstDataTime) / candleInterval; const indexInView = indexInData - view.startIndex; return indexToX(indexInView); }, [data, candleInterval, view.startIndex, indexToX]);

    const xToTime = useMemo(() => (x: number): number => {
        if (data.length === 0) {
            return Math.floor(Date.now() / 1000);
        }

        const indexInView = xToIndex(x);
        const dataIndex = view.startIndex + indexInView;

        if (dataIndex < 0) {
            const firstCandle = data[0];
            return firstCandle ? firstCandle.time + (dataIndex * candleInterval) : 0;
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
                return lastCandle.time + ((dataIndex - lastDataIndex) * candleInterval);
            }
            return 0;
        }
    }, [xToIndex, data, view.startIndex, candleInterval]);

    const formatPrice = (price: number) => price.toFixed(price > 100 ? 2 : 5);
    const formatDate = (date: Date, format: string) => { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); const monthShort = date.toLocaleString('default', { month: 'short' }); return format.replace('YYYY', String(year)).replace('MM', month).replace('DD', day).replace('MMM', monthShort); };
    const formatTime = (date: Date, format: string) => { let hours = date.getHours(); const minutes = String(date.getMinutes()).padStart(2, '0'); const seconds = String(date.getSeconds()).padStart(2, '0'); if (format.includes('AM/PM')) { const ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12; hours = hours ? hours : 12; const hoursStr = String(hours); let result = format.replace('hh', hoursStr).replace('mm', minutes); if (format.includes('ss')) { result = result.replace('ss', seconds); } return result.replace(' AM/PM', ` ${ampm}`); } else { const hoursStr = String(hours).padStart(2, '0'); let result = format.replace('hh', hoursStr).replace('mm', minutes); if (format.includes('ss')) { result = result.replace('ss', seconds); } return result; } };
    const formatTimeLabel = (timestamp: number, timeframe: string) => { const date = new Date(timestamp * 1000); const { dateFormat, timeFormat } = chartSettings.scalesAndLines; const formattedDate = formatDate(date, dateFormat); const formattedTime = formatTime(date, timeFormat); const intervalSeconds = candleInterval; if (intervalSeconds >= 86400) { return formattedDate; } if (intervalSeconds >= 3600) { return `${formattedDate} ${formattedTime.replace(/:ss| AM\/PM/g, '').trim()}`; } return formattedTime.replace(/:ss| AM\/PM/g, '').trim(); };

    useEffect(() => {
        if (!tooltip.visible) {
            if (data.length > 0) {
                setHeaderOhlc(data[data.length - 1]);
            } else {
                setHeaderOhlc(null);
            }
        }
    }, [data, tooltip.visible]);
    useEffect(() => { if (isAutoScaling && visibleData.length > 0) { let dataMin = Infinity; let dataMax = -Infinity; for (const d of visibleData) { dataMin = Math.min(dataMin, d.low); dataMax = Math.max(dataMax, d.high); } if (dataMin === dataMax) { const price = dataMin; dataMin = price * 0.999; dataMax = price * 1.001; if (dataMin === dataMax) { dataMin -= 0.001; dataMax += 0.001; } } const buffer = (dataMax - dataMin) * 0.1; setPriceRange({ min: dataMin - buffer, max: dataMax + buffer }); } }, [visibleData, isAutoScaling]);

    useEffect(() => { const handleKeyDown = (e: KeyboardEvent) => { if (editingText || isIndicatorPanelOpen || indicatorToEdit) return; if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) { commitDrawingChange(prev => prev.filter(d => d.id !== selectedDrawingId)); setSelectedDrawingId(null); } if (e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); resetView(); } if (e.ctrlKey || e.metaKey) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); } } if (e.key === 'Escape') { if (currentDrawing) { setCurrentDrawing(null); setActiveTool(null); } if (selectedDrawingId) { setSelectedDrawingId(null); } } }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [selectedDrawingId, drawings, undoStack, redoStack, editingText, currentDrawing, isIndicatorPanelOpen, indicatorToEdit]);
    useEffect(() => { const timerId = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timerId); }, []);
    useEffect(() => { if (!chartSettings.scalesAndLines.showCountdown || data.length === 0 || candleInterval <= 0) { setCountdown(null); return; } const timerId = setInterval(() => { const nowInSeconds = Math.floor(Date.now() / 1000); const nextBarTime = (Math.floor(nowInSeconds / candleInterval) + 1) * candleInterval; let secondsRemaining = nextBarTime - nowInSeconds; if (secondsRemaining < 0) secondsRemaining = 0; const minutes = Math.floor(secondsRemaining / 60); const seconds = secondsRemaining % 60; const formattedCountdown = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; setCountdown(formattedCountdown); }, 1000); return () => clearInterval(timerId); }, [chartSettings.scalesAndLines.showCountdown, data, candleInterval]);

    const yAxisLabels = useMemo(() => { if (priceRange.max === priceRange.min || !chartDimensions.height) return []; const range = priceRange.max - priceRange.min; if (range <= 0) return []; const numLabels = Math.max(1, Math.floor(chartDimensions.height / 30)); const rawStep = range / numLabels; const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep))); const residual = rawStep / magnitude; let niceStep; if (residual > 5) { niceStep = 10 * magnitude; } else if (residual > 2.2) { niceStep = 5 * magnitude; } else if (residual > 1) { niceStep = 2 * magnitude; } else { niceStep = magnitude; } if (niceStep <= 0) return []; const labels = []; const firstLabel = Math.floor(priceRange.min / niceStep) * niceStep; for (let price = firstLabel; price < priceRange.max + niceStep; price += niceStep) { if (price >= priceRange.min) { labels.push({ y: yScale(price), price: formatPrice(price) }); } } return labels; }, [yScale, priceRange, chartDimensions.height]);

    const xAxisLabels = useMemo(() => {
        if (!chartDimensions.width || data.length === 0 || xStep <= 0 || candleInterval <= 0) return [];

        const visibleTimeRange = view.visibleCandles * candleInterval;

        const intervals = [
            60,           // 1 minute
            5 * 60,       // 5 minutes
            15 * 60,      // 15 minutes
            30 * 60,      // 30 minutes
            60 * 60,      // 1 hour
            2 * 60 * 60,  // 2 hours
            4 * 60 * 60,  // 4 hours
            12 * 60 * 60, // 12 hours
            24 * 60 * 60, // 1 day
            7 * 24 * 60 * 60, // 1 week
            30 * 24 * 60 * 60, // 1 month (approx)
            365 * 24 * 60 * 60, // 1 year (approx)
        ];

        const targetLabelSpacing = 120;
        const targetLabels = chartDimensions.width / targetLabelSpacing;
        const targetInterval = visibleTimeRange / targetLabels;

        const majorInterval = intervals.find(interval => interval > targetInterval) || intervals[intervals.length - 1];

        const labels = [];
        const firstVisibleTime = xToTime(0);
        const lastVisibleTime = xToTime(chartDimensions.width);

        const startOfLabels = Math.floor(firstVisibleTime / majorInterval) * majorInterval;

        for (let time = startOfLabels; time < lastVisibleTime + majorInterval; time += majorInterval) {
            const x = timeToX(time);
            if (x >= -xStep && x < chartDimensions.width + xStep) {
                labels.push({ x, time });
            }
        }

        return labels;
    }, [view.visibleCandles, chartDimensions.width, xStep, candleInterval, timeToX, xToTime, data.length]);

    const getSnappedPoint = useMemo(() => (svgX: number, svgY: number): { point: Point, indicator: { x: number, y: number } | null } => { const unsnappedPoint = { time: xToTime(svgX), price: yToPrice(svgY) }; if (xStep <= 0 || data.length === 0) { return { point: unsnappedPoint, indicator: null }; } const indexInViewRaw = (svgX / xStep) - 0.5; const closestDataIndex = Math.round(view.startIndex + indexInViewRaw); let bestSnap: { point: Point, indicator: { x: number, y: number }, distanceSq: number } | null = null; const searchRadius = 2; for (let i = -searchRadius; i <= searchRadius; i++) { const candleDataIndex = closestDataIndex + i; if (candleDataIndex < 0 || candleDataIndex >= data.length) continue; const candle = data[candleDataIndex]; if (!candle) continue; const effectiveIndexInView = candleDataIndex - view.startIndex; const candleX = indexToX(effectiveIndexInView); const prices = [candle.open, candle.high, candle.low, candle.close]; for (const price of prices) { const priceY = yScale(price); const distanceSq = (svgX - candleX) ** 2 + (svgY - priceY) ** 2; if (distanceSq < SNAP_THRESHOLD ** 2) { if (!bestSnap || distanceSq < bestSnap.distanceSq) { bestSnap = { point: { time: candle.time, price: price }, indicator: { x: candleX, y: priceY }, distanceSq: distanceSq }; } } } } if (bestSnap) { return { point: bestSnap.point, indicator: bestSnap.indicator }; } else { return { point: unsnappedPoint, indicator: null }; } }, [data, view.startIndex, xStep, yScale, xToTime, yToPrice, indexToX]);

    useEffect(() => {
        const animationFrameId = requestAnimationFrame(() => {
            const chartCanvas = chartCanvasRef.current;
            const chartContext = chartCanvas?.getContext('2d');
            const startIdx = Math.max(0, firstIndexToRender);

            if (chartCanvas && chartContext && chartDimensions.width && chartDimensions.height && data.length) {
                const dpr = window.devicePixelRatio || 1;
                chartCanvas.width = chartDimensions.width * dpr;
                chartCanvas.height = chartDimensions.height * dpr;
                chartCanvas.style.width = `${chartDimensions.width}px`;
                chartCanvas.style.height = `${chartDimensions.height}px`;
                chartContext.scale(dpr, dpr);
                chartContext.clearRect(0, 0, chartDimensions.width, chartDimensions.height);

                if (chartSettings.canvas.backgroundType === 'gradient') {
                    const gradient = chartContext.createLinearGradient(0, 0, 0, chartDimensions.height);
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
                    chartContext.fillText(text, chartDimensions.width / 2, chartDimensions.height / 2);
                }

                if (chartSettings.scalesAndLines.showGrid) {
                    chartContext.strokeStyle = chartSettings.scalesAndLines.gridColor;
                    chartContext.lineWidth = 0.5;
                    yAxisLabels.forEach(label => {
                        chartContext.beginPath();
                        chartContext.moveTo(0, label.y);
                        chartContext.lineTo(chartDimensions.width, label.y);
                        chartContext.stroke();
                    });
                    xAxisLabels.forEach(label => {
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
                        const isBullish = chartSettings.symbol.colorBarsOnPrevClose && prevCandle
                            ? d.close >= prevCandle.close
                            : d.close >= d.open;

                        const bodyColor = isBullish ? chartSettings.symbol.bodyUpColor : chartSettings.symbol.bodyDownColor;
                        const borderColor = isBullish ? chartSettings.symbol.borderUpColor : chartSettings.symbol.borderDownColor;
                        const wickColor = isBullish ? chartSettings.symbol.wickUpColor : chartSettings.symbol.wickDownColor;

                        if (chartSettings.symbol.showWick) {
                            chartContext.beginPath();
                            chartContext.strokeStyle = wickColor;
                            chartContext.lineWidth = 1;
                            chartContext.moveTo(x, yScale(d.high));
                            chartContext.lineTo(x, yScale(d.low));
                            chartContext.stroke();
                        }

                        const bodyY = isBullish ? yScale(d.close) : yScale(d.open);
                        const bodyHeight = Math.max(1, Math.abs(yScale(d.open) - yScale(d.close)));
                        const bodyX = x - xStep * 0.35;
                        const bodyWidth = xStep * 0.7;

                        if (chartSettings.symbol.showBody) {
                            chartContext.fillStyle = bodyColor;
                            chartContext.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
                        }

                        if (chartSettings.symbol.showBorders) {
                            chartContext.strokeStyle = borderColor;
                            chartContext.lineWidth = 1;
                            chartContext.strokeRect(bodyX, bodyY, bodyWidth, bodyHeight);
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
                    chartContext.strokeStyle = isUp ? chartSettings.symbol.bodyUpColor : chartSettings.symbol.bodyDownColor;
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
                const dpr = window.devicePixelRatio || 1;
                yAxisCanvas.width = yAxisDimensions.width * dpr;
                yAxisCanvas.height = yAxisDimensions.height * dpr;
                yAxisCanvas.style.width = `${yAxisDimensions.width}px`;
                yAxisCanvas.style.height = `${yAxisDimensions.height}px`;
                yAxisContext.scale(dpr, dpr);
                yAxisContext.clearRect(0, 0, yAxisDimensions.width, yAxisDimensions.height);
                yAxisContext.fillStyle = chartSettings.canvas.backgroundColor;
                yAxisContext.fillRect(0, 0, yAxisDimensions.width, yAxisDimensions.height);
                yAxisContext.font = "11px Inter, sans-serif";
                yAxisContext.fillStyle = chartSettings.canvas.textColor;
                yAxisContext.textAlign = "left";
                yAxisLabels.forEach(label => {
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
                    let labelY = Math.max(0, Math.min(lastPriceY - labelHeight / 2, yAxisDimensions.height - labelHeight));

                    if (chartSettings.scalesAndLines.showLastPriceLabel) {
                        const bgColor = isUp ? chartSettings.symbol.bodyUpColor : chartSettings.symbol.bodyDownColor;
                        yAxisContext.fillStyle = bgColor;
                        yAxisContext.fillRect(0, labelY, yAxisDimensions.width, labelHeight);

                        const textColor = getTextColorForBackground(bgColor);
                        yAxisContext.fillStyle = textColor;
                        yAxisContext.textAlign = "left";

                        if (hasCountdown) {
                            yAxisContext.font = "bold 11px Inter, sans-serif";
                            yAxisContext.fillText(formatPrice(lastPrice), 6, labelY + 12);
                            yAxisContext.font = "11px Inter, sans-serif";
                            yAxisContext.fillText(countdown!, 6, labelY + 26);
                        } else {
                            yAxisContext.font = "bold 11px Inter, sans-serif";
                            yAxisContext.fillText(formatPrice(lastPrice), 6, labelY + 14);
                        }
                    }
                }
                if (chartSettings.scalesAndLines.showPriceLabels) {
                    const labels: LabelInfo[] = [];
                    drawings.forEach(d => {
                        if (d.isVisible === false) return;
                        switch (d.type) {
                            case 'Horizontal Line': labels.push({ price: d.price, color: d.style.color, text: formatPrice(d.price) }); break;
                            case 'Ray': if (d.end) labels.push({ price: d.end.price, color: d.style.color, text: formatPrice(d.end.price) }); break;
                            case 'Horizontal Ray': if (d.start) labels.push({ price: d.start.price, color: d.style.color, text: formatPrice(d.start.price) }); break;
                        }
                    });

                    labels.forEach(label => {
                        const y = yScale(label.price);
                        if (y >= 0 && y <= yAxisDimensions.height) {
                            yAxisContext.fillStyle = label.color;
                            yAxisContext.fillRect(0, y - 10, yAxisDimensions.width, 20);
                            yAxisContext.fillStyle = getTextColorForBackground(label.color);
                            yAxisContext.fillText(label.text || '', 6, y + 4);
                        }
                    });
                }

                if (tooltip.visible && chartSettings.scalesAndLines.showCrosshair && tooltip.y >= 0 && tooltip.y <= yAxisDimensions.height) {
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
                        yAxisContext.textAlign = "left";
                        yAxisContext.font = "bold 11px Inter, sans-serif";
                        yAxisContext.fillText(formatPrice(price), 6, priceY + 4);
                    }
                }
            }

            const xAxisCanvas = xAxisCanvasRef.current;
            const xAxisContext = xAxisCanvas?.getContext('2d');
            if (xAxisCanvas && xAxisContext && xAxisDimensions.width && xAxisDimensions.height) {
                const dpr = window.devicePixelRatio || 1;
                xAxisCanvas.width = xAxisDimensions.width * dpr;
                xAxisCanvas.height = xAxisDimensions.height * dpr;
                xAxisCanvas.style.width = `${xAxisDimensions.width}px`;
                xAxisCanvas.style.height = `${xAxisDimensions.height}px`;
                xAxisContext.scale(dpr, dpr);
                xAxisContext.clearRect(0, 0, xAxisDimensions.width, xAxisDimensions.height);
                xAxisContext.fillStyle = chartSettings.canvas.backgroundColor;
                xAxisContext.fillRect(0, 0, xAxisDimensions.width, xAxisDimensions.height);
                xAxisContext.font = "11px Inter, sans-serif";
                xAxisContext.fillStyle = chartSettings.canvas.textColor;
                xAxisContext.textAlign = "center";
                xAxisLabels.forEach(label => {
                    xAxisContext.fillText(formatTimeLabel(label.time, activeTimeframe), label.x, 16);
                });

                if (tooltip.visible && chartSettings.scalesAndLines.showCrosshair && tooltip.x >= 0 && tooltip.x <= xAxisDimensions.width) {
                    const timeX = tooltip.x;
                    const timeAtCursor = xToTime(timeX);
                    const labelWidth = 100;
                    xAxisContext.fillStyle = '#3B82F6'; // blue-500
                    xAxisContext.fillRect(timeX - labelWidth / 2, 0, labelWidth, xAxisDimensions.height);
                    xAxisContext.fillStyle = '#FFFFFF';
                    xAxisContext.textAlign = 'center';
                    xAxisContext.font = "bold 11px Inter, sans-serif";
                    xAxisContext.fillText(formatTimeLabel(timeAtCursor, activeTimeframe), timeX, 16);
                }
            }
        });
        return () => cancelAnimationFrame(animationFrameId);
    }, [visibleData, chartDimensions, xStep, yScale, indexToX, priceRange, yAxisLabels, yAxisDimensions, alerts, countdown, xAxisLabels, xAxisDimensions, activeTimeframe, panelIndicators, view, chartType, chartSettings, openPositions, isBottomPanelOpen, rightPanel, order, headerOhlc, data, firstIndexToRender, lastIndexToRender, tooltip, xToTime]);

    // Panel Indicators Drawing Effect
    useEffect(() => {
        panelIndicators.forEach(indicator => {
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

            const dpr = window.devicePixelRatio || 1;

            // Setup Canvas
            if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                ctx.scale(dpr, dpr);
            }
            if (yAxisCanvas.width !== yAxisWidth * dpr || yAxisCanvas.height !== yAxisHeight * dpr) {
                yAxisCanvas.width = yAxisWidth * dpr;
                yAxisCanvas.height = yAxisHeight * dpr;
                yAxisCtx.scale(dpr, dpr);
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

            if (!indicator.data) return;

            // Determine Scale (Min/Max)
            let min = Infinity, max = -Infinity;
            const isBounded = ['RSI', 'Stochastic', 'MFI', 'CCI'].includes(indicator.type);

            if (isBounded) {
                min = 0; max = 100;
                if (indicator.type === 'CCI') { min = -200; max = 200; } // CCI is technically unbounded but usually centered
            } else {
                // Auto-scale based on VISIBLE data
                visibleData.forEach((_, i) => {
                    const dataIndex = firstIndexToRender + i;
                    // Helper to check value
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
                    if ((indicator.type as string) === 'Bollinger Bands') { // usually overlay, but if panel
                        check(indicator.data.upper?.[dataIndex]);
                        check(indicator.data.lower?.[dataIndex]);
                    }
                });

                if (min === Infinity) { min = 0; max = 100; }
                if (min === max) { min -= 1; max += 1; }

                // Add padding
                const padding = (max - min) * 0.1;
                min -= padding;
                max += padding;
            }

            const getPanelY = (val: number) => {
                if (max === min) return height / 2;
                return height - ((val - min) / (max - min)) * height;
            };

            // Draw Y-Axis Labels
            yAxisCtx.fillStyle = chartSettings.canvas.textColor;
            yAxisCtx.font = "10px Inter, sans-serif";
            yAxisCtx.textAlign = "left";

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
            ctx.lineWidth = 1.5;

            const drawLine = (dataArr: (number | null)[], color: string) => {
                ctx.beginPath();
                ctx.strokeStyle = color;
                let started = false;

                for (let i = 0; i < view.visibleCandles; i++) {
                    const dataIndex = Math.floor(view.startIndex) + i;
                    const val = dataArr[dataIndex];
                    if (val === null || val === undefined) {
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
                        if (val == null) continue;

                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val);
                        const zeroY = getPanelY(0);

                        ctx.fillStyle = val >= 0 ? '#26a69a' : '#ef5350';
                        ctx.globalAlpha = 0.5;
                        const barWidth = xStep * 0.8;
                        // Center bar on x
                        ctx.fillRect(x - barWidth / 2, Math.min(y, zeroY), barWidth, Math.abs(y - zeroY));
                    }
                    ctx.globalAlpha = 1;
                }

                if (indicator.data.macd) drawLine(indicator.data.macd, '#2962FF');
                if (indicator.data.signal) drawLine(indicator.data.signal, '#FF6D00');

            } else if (indicator.type === 'Stochastic') {
                // Bands
                const k = indicator.data.k;
                const d = indicator.data.d;

                // Draw Levels
                [20, 80].forEach(level => {
                    const y = getPanelY(level);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = chartSettings.scalesAndLines.gridColor; // Use slightly more visible
                    ctx.moveTo(0, y); ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                });

                if (k) drawLine(k, '#2962FF');
                if (d) drawLine(d, '#FF6D00');

            } else {
                // Standard Single Line (RSI, etc.)
                const main = indicator.data.main;
                if (main) {
                    // Levels for oscillating indicators
                    if (isBounded) {
                        const levels = indicator.type === 'RSI' ? [30, 70] : [0]; // default
                        if (indicator.type === 'CCI') levels[0] = 0;

                        levels.forEach(level => {
                            const y = getPanelY(level);
                            ctx.beginPath();
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                            // Could do fill between 70/30
                            ctx.setLineDash([4, 4]);
                            ctx.strokeStyle = '#787B86';
                            ctx.moveTo(0, y); ctx.lineTo(width, y);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        });
                    }

                    drawLine(main, indicator.settings.color || '#2962FF');
                }
            }

            // Draw Crosshair info if exists
            if (tooltip.visible && tooltip.x >= 0 && tooltip.x <= width) {
                const timeX = tooltip.x;
                const indexInView = (timeX / xStep) - 0.5;
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
                    ctx.strokeStyle = '#787B86';
                    ctx.setLineDash([4, 4]);
                    ctx.moveTo(timeX, 0); ctx.lineTo(timeX, height);
                    ctx.moveTo(0, y); ctx.lineTo(width, y);
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
    }, [panelIndicators, firstIndexToRender, view, visibleData, chartSettings, xStep, indexToX, tooltip, data]);

    const distSq = (p1: { x: number, y: number }, p2: { x: number, y: number }) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    const distToSegmentSquared = (p: { x: number, y: number }, v: { x: number, y: number }, w: { x: number, y: number }) => {
        const l2 = distSq(v, w);
        if (l2 === 0) return distSq(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return distSq(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    };
    const perpendicularDistanceSquared = (p: { x: number, y: number }, v: { x: number, y: number }, w: { x: number, y: number }) => {
        let l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
        if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
    };

    const findDrawingAtPoint = (svgX: number, svgY: number): { drawing: Drawing; handle?: string } | null => {
        // Check selection in reverse order to pick the topmost drawing
        for (let i = drawings.length - 1; i >= 0; i--) {
            const d = drawings[i];
            if (d.isVisible === false) continue;
            const p = { x: svgX, y: svgY };

            if (d.type === 'Horizontal Line') {
                const y = yScale(d.price);
                if (Math.abs(p.y - y) < HITBOX_WIDTH) return { drawing: d };
            }
            else if (d.type === 'Vertical Line') {
                const x = timeToX(d.time);
                if (Math.abs(p.x - x) < HITBOX_WIDTH) return { drawing: d };
            }
            else if (d.type === 'Horizontal Ray') {
                if (!d.start) continue;
                const start = { x: timeToX(d.start.time), y: yScale(d.start.price) };
                if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
                if (Math.abs(p.y - start.y) < HITBOX_WIDTH && p.x >= start.x) return { drawing: d };
            }
            else if (d.type === 'Text Note') {
                if (!d.point) continue;
                const x = timeToX(d.point.time);
                const y = yScale(d.point.price);

                // Measure text
                const fontSize = d.style.fontSize || 14;
                const padding = 8;
                const textWidth = d.text.length * (fontSize * 0.6) + padding * 2;
                const textHeight = fontSize + padding * 2;

                // Hitbox for the text box area (Text Note anchors top-leftish)
                // In render: rect x={x} y={y - textHeight + padding}
                if (p.x >= x && p.x <= x + textWidth && p.y >= y - textHeight + padding && p.y <= y + padding) {
                    return { drawing: d };
                }
            }
            else if (d.type === 'Callout') {
                if (!d.anchor || !d.label) continue;
                const anchor = { x: timeToX(d.anchor.time), y: yScale(d.anchor.price) };
                const label = { x: timeToX(d.label.time), y: yScale(d.label.price) };

                if (distSq(p, anchor) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'anchor' };
                if (distSq(p, label) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'label' };

                // Hitbox for the text box area around label
                const fontSize = 12;
                const padding = 8;
                const textWidth = (d.text.length * (fontSize * 0.6)) + padding * 3;
                const textHeight = fontSize + padding * 2 + 10;

                // Centered box
                const halfW = textWidth / 2;
                const halfH = textHeight / 2;

                if (p.x >= label.x - halfW && p.x <= label.x + halfW && p.y >= label.y - halfH && p.y <= label.y + halfH) {
                    return { drawing: d };
                }
            }
            else if (d.type === 'Long Position' || d.type === 'Short Position') {
                if (!d.entry || !d.profit || !d.stop) continue;

                const entry = { x: timeToX(d.entry.time), y: yScale(d.entry.price) };
                const profit = { x: timeToX(d.profit.time), y: yScale(d.profit.price) };
                const stop = { x: timeToX(d.stop.time), y: yScale(d.stop.price) };

                if (distSq(p, entry) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'entry' };
                if (distSq(p, profit) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'profit' };
                if (distSq(p, stop) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'stop' };

                // Bounds check for the two boxes
                const minX = Math.min(entry.x, profit.x);
                const maxX = Math.max(entry.x, profit.x);

                // Profit box Y range
                const profitMinY = Math.min(entry.y, profit.y);
                const profitMaxY = Math.max(entry.y, profit.y);

                // Stop box Y range
                const stopMinY = Math.min(entry.y, stop.y);
                const stopMaxY = Math.max(entry.y, stop.y);

                if (p.x >= minX && p.x <= maxX) {
                    if (p.y >= profitMinY && p.y <= profitMaxY) return { drawing: d };
                    if (p.y >= stopMinY && p.y <= stopMaxY) return { drawing: d };
                }
            }
            else if (d.type === 'Parallel Channel') {
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
                    if (distSq(p, l2_end) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'p2_end' };

                    // Line 2 check
                    if (distToSegmentSquared(p, l2_start, l2_end) < HITBOX_WIDTH ** 2) return { drawing: d };

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
            }
            else if (d.type === 'Fibonacci Retracement') {
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
            }
            else if (d.type === 'Path' || d.type === 'Brush') {
                if (d.points.length < 2) continue;

                // Check handles first (for Path)
                if (d.type === 'Path') {
                    for (let i = 0; i < d.points.length; i++) {
                        const point = { x: timeToX(d.points[i].time), y: yScale(d.points[i].price) };
                        if (distSq(p, point) < HANDLE_RADIUS ** 2) return { drawing: d, handle: `p${i}` as any };
                    }
                }

                // Check proximity to any segment
                let hit = false;
                for (let i = 0; i < d.points.length - 1; i++) {
                    const p1 = { x: timeToX(d.points[i].time), y: yScale(d.points[i].price) };
                    const p2 = { x: timeToX(d.points[i + 1].time), y: yScale(d.points[i + 1].price) };
                    if (distToSegmentSquared(p, p1, p2) < HITBOX_WIDTH ** 2) {
                        hit = true;
                        break;
                    }
                }

                if (hit) return { drawing: d };
            }
            else {
                // Standard 2-point tools (Trend Line, Rectangle, etc.)
                const hasStart = 'start' in d;
                const hasEnd = 'end' in d;

                if (hasStart && hasEnd) {
                    const startPoint = (d as any).start;
                    const endPoint = (d as any).end;
                    if (!startPoint || !endPoint) continue;

                    const start = { x: timeToX(startPoint.time), y: yScale(startPoint.price) };
                    const end = { x: timeToX(endPoint.time), y: yScale(endPoint.price) };

                    if (distSq(p, start) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'start' };
                    if (distSq(p, end) < HANDLE_RADIUS ** 2) return { drawing: d, handle: 'end' };

                    if (d.type === 'Rectangle' || d.type === 'Price Range' || d.type === 'Date Range' || d.type === 'Date & Price Range' || d.type === 'Gann Box') {
                        const minX = Math.min(start.x, end.x);
                        const maxX = Math.max(start.x, end.x);
                        const minY = Math.min(start.y, end.y);
                        const maxY = Math.max(start.y, end.y);

                        // Check edges for resizing
                        if (Math.abs(p.x - minX) < HITBOX_WIDTH && p.y > minY && p.y < maxY) return { drawing: d, handle: 'start' };

                        // Check inside for moving
                        if (p.x > minX && p.x < maxX && p.y > minY && p.y < maxY) return { drawing: d };
                    } else {
                        // Line-based hit test
                        if (distToSegmentSquared(p, start, end) < HITBOX_WIDTH ** 2) return { drawing: d };
                    }
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
            isVisible: false
        };
        setAlertModalInfo({ visible: true, drawing: fakeDrawing });
        setContextMenu(null);
    };

    const handleCreateDrawingAlert = (drawing: Drawing) => {
        // Enforce one alert per drawing limit
        const existingAlert = alerts.find(a => a.drawingId === drawing.id);
        if (existingAlert) {
            alert("An alert already exists for this drawing. Please delete the existing alert first.");
            return;
        }

        setAlertModalInfo({ visible: true, drawing });
        setContextMenu(null);
    };

    const handleCreateAlertFromModal = (settings: {
        condition: AlertConditionType,
        value?: number,
        fibLevel?: number,
        message: string,
        notifyApp: boolean,
        playSound: boolean,
        triggerFrequency: 'Only Once' | 'Once Per Bar' | 'Once Per Bar Close' | 'Once Per Minute',
        indicatorId?: string,
        alertConditionId?: string,
        conditionParameters?: Record<string, any>
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
                conditionParameters: settings.conditionParameters
            };
            priceAlertService.updateAlert(updatedAlert.id, updatedAlert);
            setAlerts(prev => prev.map(a => a.id === updatedAlert.id ? updatedAlert : a));
        } else {
            // Create new alert
            const newAlert: PriceAlert = {
                id: `alert-${Date.now()}`,
                symbol: symbol,
                drawingId: (alertModalInfo.drawing?.id && !alertModalInfo.drawing.id.startsWith('temp_alert')) ? alertModalInfo.drawing.id : undefined,
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
                conditionParameters: settings.conditionParameters
            };
            priceAlertService.saveAlert(newAlert);
            setAlerts(prev => [...prev, newAlert]);
        }
        setAlertModalInfo({ visible: false, drawing: null, alertToEdit: null });
    };

    const handleEditAlert = (alert: PriceAlert) => {
        const drawing = drawings.find(d => d.id === alert.drawingId);
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
            drawing: hit?.drawing
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
                max: center + newRange / 2
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

        setView(v => {
            let newVisible = v.visibleCandles * factor;

            // Pre-clamp newVisible to avoid drift when hitting limits (`getClampedViewState` would do this, but we need the final value for ratios)
            const maxVisible = Math.max(data.length * 1.5, 300);
            newVisible = Math.max(MIN_CANDLES, Math.min(maxVisible, newVisible));

            // Anchor Logic:
            // 1. If Last Candle is visible, LOCK it to its screen position.
            // 2. Fallback to right edge anchoring.

            const lastCandleIndex = data.length - 1;
            const currentRightEdgeIndex = v.startIndex + v.visibleCandles;

            const isLastCandleVisible = lastCandleIndex >= v.startIndex && lastCandleIndex <= currentRightEdgeIndex;

            if (isLastCandleVisible && data.length > 0) {
                // Ratio of Last Candle position relative to current view
                // ratio = (Index - Start) / Visible
                // This ratio represents "What % across the screen is the Last Candle?"
                const ratio = (lastCandleIndex - v.startIndex) / v.visibleCandles;

                // To maintain the Lock, the Last Candle must be at the SAME ratio in the NEW view.
                // ratio = (lastCandleIndex - newStartIndex) / newVisible
                // newStartIndex = lastCandleIndex - (ratio * newVisible)
                const newStartIndex = lastCandleIndex - (ratio * newVisible);

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
    const savedToolbarPos = useRef<{ x: number, y: number } | null>(null);

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Try local storage first for speed
                const local = localStorage.getItem('drawingToolbarPos');
                let pos = local ? JSON.parse(local) : null;

                // Validate loaded pos
                if (pos && (typeof pos.x !== 'number' || typeof pos.y !== 'number' || isNaN(pos.x) || isNaN(pos.y))) {
                    console.warn("Invalid toolbar position in storage, resetting.");
                    pos = null;
                }

                if (pos) savedToolbarPos.current = pos;

                // Fetch from DB
                const settings = await api.getUserSettings();
                if (settings.drawingToolbarPos) {
                    let dbPos = settings.drawingToolbarPos;
                    // Validate DB pos
                    if (dbPos && (typeof dbPos.x !== 'number' || typeof dbPos.y !== 'number' || isNaN(dbPos.x) || isNaN(dbPos.y))) {
                        dbPos = null;
                    }

                    if (dbPos) {
                        savedToolbarPos.current = dbPos;
                        localStorage.setItem('drawingToolbarPos', JSON.stringify(dbPos));
                    }
                }
            } catch (e) {
                console.error("Failed to load toolbar settings", e);
            }
        };
        loadSettings();
    }, []);




    const handleDrawingClick = (svgX: number, svgY: number, snappedPoint: Point): boolean => {
        // --- CASE 1: CONTINUE DRAWING (Step 2+) ---
        if (currentDrawing && interaction.type === 'drawing') {
            // Path / Brush Tools
            if (currentDrawing.type === 'Path') {
                setCurrentDrawing(prev => {
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
                    commitDrawingChange(prev => [...prev, finalDrawing]);
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
                commitDrawingChange(prev => [...prev, drawing as Drawing]);
                setEditingText({ drawing: drawing as CalloutDrawing, x: timeToX(drawing.label.time), y: yScale(drawing.label.price) });
                setCurrentDrawing(null);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }

            // 2-Point Tools Step 2 (Click-click method)
            const isTwoPointTool = ['Trend Line', 'Ray', 'Horizontal Ray', 'Rectangle', 'Fibonacci Retracement', 'Gann Box', 'Arrow', 'Price Range', 'Date Range', 'Date & Price Range', 'Callout'].includes(currentDrawing.type);
            if (isTwoPointTool) {
                const { step, ...drawing } = currentDrawing as any;
                const finalDrawing = { ...drawing, end: snappedPoint };
                commitDrawingChange(prev => [...prev, finalDrawing as Drawing]);
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
            const defaultStyle: DrawingStyle = { color: '#3B82F6', width: 2, lineStyle: 'solid', fillColor: 'rgba(59, 130, 246, 0.2)' };
            const id = `d${Date.now()}`;

            // Handle Instant Tools
            if (activeTool === 'Horizontal Line') {
                const hl: HorizontalLineDrawing = { id, type: activeTool, price: snappedPoint.price, style: defaultStyle, isVisible: true };
                commitDrawingChange(prev => [...prev, hl]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Vertical Line') {
                const vl: VerticalLineDrawing = { id, type: activeTool, time: snappedPoint.time, style: defaultStyle, isVisible: true };
                commitDrawingChange(prev => [...prev, vl]);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return true;
            }
            if (activeTool === 'Text Note') {
                const textNote: TextNoteDrawing = { id, type: activeTool, point: snappedPoint, text: "Note...", style: { ...defaultStyle, fontSize: 14 }, isVisible: true };
                commitDrawingChange(prev => [...prev, textNote]);
                setEditingText({ drawing: textNote, x: timeToX(snappedPoint.time), y: yScale(snappedPoint.price) });
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
                    newDrawing = { id, type: activeTool, start: snappedPoint, end: snappedPoint, style: defaultStyle, step: 1 };
                    break;
                case 'Parallel Channel':
                    newDrawing = { id, type: activeTool, start: snappedPoint, end: snappedPoint, p2: snappedPoint, step: 1, style: { ...defaultStyle, fillColor: 'rgba(59, 130, 246, 0.1)' } };
                    break;
                case 'Long Position':
                case 'Short Position': {
                    // Position tools are instant placement but calculated
                    const isLong = activeTool === 'Long Position';
                    const priceOffset = snappedPoint.price * 0.01;
                    const futureTime = snappedPoint.time + (data.length > 1 ? (data[1].time - data[0].time) : 3600) * 20;
                    const posDrawing = {
                        id,
                        type: activeTool,
                        entry: snappedPoint,
                        profit: { time: futureTime, price: isLong ? snappedPoint.price + priceOffset : snappedPoint.price - priceOffset },
                        stop: { time: futureTime, price: isLong ? snappedPoint.price - priceOffset : snappedPoint.price + priceOffset },
                        style: defaultStyle,
                        isVisible: true,
                    };
                    commitDrawingChange(prev => [...prev, posDrawing]);
                    setSelectedDrawingId(posDrawing.id);
                    setActiveTool(null);
                    setInteraction({ type: 'none' });
                    return true;
                }
                case 'Path': newDrawing = { id, type: 'Path', points: [snappedPoint, snappedPoint], style: defaultStyle, isVisible: true }; break;
                case 'Brush': newDrawing = { id, type: 'Brush', points: [snappedPoint], style: defaultStyle, isVisible: true }; break;
                case 'Callout': newDrawing = { id, type: 'Callout', anchor: snappedPoint, label: snappedPoint, text: 'Note...', step: 1, style: defaultStyle, isVisible: true }; break;
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
                } catch { }
            }

            setFloatingToolbarPos(savedToolbarPos.current ? savedToolbarPos.current : { x: svgX, y: svgY });

            if (hit.handle) {
                setInteraction({ type: 'resizing', drawingId: hit.drawing.id, handle: hit.handle, initialDrawing: hit.drawing, startMousePos: { x: svgX, y: svgY }, startPoint: snappedPoint });
            } else {
                setInteraction({ type: 'moving', drawingId: hit.drawing.id, initialDrawing: hit.drawing, startMousePos: { x: svgX, y: svgY }, startPoint: snappedPoint });
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
        if ((e.target as HTMLElement).closest('button, input, select, textarea, [data-context-menu]')) return;
        if (!eventContainerRef.current || !chartContainerRef.current) return;
        eventContainerRef.current.focus();

        // Capture pointer and track it
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        tapDetectionRef.current = {
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
            wasVisible: tooltip.visible
        };

        const chartRect = chartContainerRef.current.getBoundingClientRect();
        const isTouch = e.pointerType === 'touch';
        const touchYOffset = isTouch ? 70 : 0;
        const svgX = e.clientX - chartRect.left;
        const svgY = e.clientY - chartRect.top - touchYOffset;

        // Always show crosshair immediately on touch
        if (xStep > 0) {
            const indexInViewFloat = view.startIndex + (svgX / xStep) - 0.5;
            const dataIndex = Math.round(indexInViewFloat);
            const candleData = (dataIndex >= 0 && dataIndex < data.length) ? data[dataIndex] : null;
            setTooltip(prev => ({
                visible: true,
                x: candleData ? indexToX(dataIndex - view.startIndex) : svgX,
                y: svgY,
                data: candleData
            }));
        } else {
            setTooltip(prev => ({ visible: true, x: svgX, y: svgY, data: null }));
        }

        // Multi-touch Pinch Check
        if (activePointers.current.size === 2) {
            const points = Array.from(activePointers.current.values()) as { x: number; y: number }[];
            const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

            const centerX = ((points[0].x + points[1].x) / 2) - chartRect.left;

            // Calculate anchor point in data coordinates
            const candlesPerPixel = view.visibleCandles / chartDimensions.width;
            const initialCenterIndex = view.startIndex + (centerX * candlesPerPixel);

            const centerY = ((points[0].y + points[1].y) / 2) - chartRect.top;
            const initialCenterPrice = yToPrice(centerY);

            setInteraction({
                type: 'pinching',
                initialDistance: dist,
                initialVisibleCandles: view.visibleCandles,
                initialStartIndex: view.startIndex,
                initialPriceRange: priceRange,
                initialCenterIndex: initialCenterIndex,
                initialCenterPrice: initialCenterPrice
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
            setInteraction({ type: 'scaling', area: 'yAxis', startX: e.clientX, startY: e.clientY, initialPriceRange: priceRange, initialStartIndex: view.startIndex, initialVisibleCandles: view.visibleCandles });
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
                    setInteraction({ type: 'panning', area: 'chart', startX: e.clientX, startY: e.clientY, initialStartIndex: view.startIndex, initialVisibleCandles: view.visibleCandles, initialPriceRange: priceRange });
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
            const points = Array.from(activePointers.current.values()) as { x: number; y: number }[];
            const newDist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

            if (newDist < 5) return; // Ignore tiny movements

            const scale = interaction.initialDistance / newDist;
            const newVisibleCandles = interaction.initialVisibleCandles * scale;

            const rect = chartContainerRef.current.getBoundingClientRect();
            const currentCenterX = ((points[0].x + points[1].x) / 2) - rect.left;

            // Anchor logic: keep the center index at the relative screen position
            const newStartIndex = interaction.initialCenterIndex - (currentCenterX * (newVisibleCandles / chartDimensions.width));

            setView(getClampedViewState(newStartIndex, newVisibleCandles));
            return;
        }

        const chartRect = chartContainerRef.current.getBoundingClientRect();
        const isTouch = e.pointerType === 'touch';
        const touchYOffset = isTouch ? 70 : 0;
        const svgX = e.clientX - chartRect.left;
        const svgY = e.clientY - chartRect.top - touchYOffset;

        // Always update tooltip/crosshair regardless of interaction state
        setTooltip(prev => ({ ...prev, visible: true, x: svgX, y: svgY }));
        if (xStep > 0) {
            const indexInViewFloat = view.startIndex + (svgX / xStep) - 0.5;
            const dataIndex = Math.round(indexInViewFloat);
            const candleData = (dataIndex >= 0 && dataIndex < data.length) ? data[dataIndex] : null;
            if (candleData) {
                setHeaderOhlc(candleData);
                // Snap crosshair X if over a candle
                setTooltip(prev => ({ ...prev, data: candleData, x: indexToX(dataIndex - view.startIndex) }));
            }
        }

        const { point: snappedPoint, indicator: snapIndicatorValue } = getSnappedPoint(svgX, svgY);
        setSnapIndicator(snapIndicatorValue);

        const currentInteractionType = currentDrawing ? 'drawing' : interaction.type;

        // Handle touch aiming visual feedback (rubber banding)
        if (isAimingRef.current && currentDrawing) {
            // Force update drawing geometry even if interaction type is 'none'
            let updatedDrawing = { ...currentDrawing };
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
                case 'Callout':
                    if (updatedDrawing.step === 1) {
                        (updatedDrawing as any).label = snappedPoint;
                    }
                    break;
            }
            setCurrentDrawing(updatedDrawing);
        }

        // Cancel long press if movement is significant
        if (longPressTimer.current && interaction.type === 'panning') {
            const dx = e.clientX - interaction.startX;
            const dy = e.clientY - interaction.startY;
            if (Math.hypot(dx, dy) > 20) { // Increased from 10
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
                        setView(getClampedViewState(interaction.initialStartIndex - candlesMoved, view.visibleCandles));
                    }
                    if (interaction.area === 'chart') {
                        const dy = e.clientY - interaction.startY;
                        const priceRangeValue = interaction.initialPriceRange.max - interaction.initialPriceRange.min;
                        if (priceRangeValue > 0 && chartDimensions.height > 0) {
                            const priceDelta = (dy / chartDimensions.height) * priceRangeValue;
                            setPriceRange({
                                min: interaction.initialPriceRange.min + priceDelta,
                                max: interaction.initialPriceRange.max + priceDelta
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
                    let updatedDrawing = { ...currentDrawing };
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
                        case 'Brush':
                            // Add points continuously, but filter for distance (smoothing input)
                            const lastPoint = (updatedDrawing as any).points[(updatedDrawing as any).points.length - 1];
                            const lastX = timeToX(lastPoint.time);
                            const lastY = yScale(lastPoint.price);
                            const currX = timeToX(snappedPoint.time);
                            const currY = yScale(snappedPoint.price);

                            // Only add if moved > 3 pixels (reduced from 5)
                            if (Math.hypot(currX - lastX, currY - lastY) > 3) {
                                (updatedDrawing as any).points = [...(updatedDrawing as any).points, snappedPoint];
                            }
                            break;
                        case 'Callout':
                            if (updatedDrawing.step === 1) {
                                (updatedDrawing as any).label = snappedPoint;
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
                    if (interaction.initialDrawing.type === 'Brush' || interaction.initialDrawing.type === 'Path') {
                        const dxTime = snappedPoint.time - interaction.startPoint.time;
                        const dyPrice = snappedPoint.price - interaction.startPoint.price;

                        const initialPts = (interaction.initialDrawing as PathDrawing).points;
                        const newPoints = initialPts.map(p => ({
                            time: p.time + dxTime,
                            price: p.price + dyPrice
                        }));
                        moved = { ...moved, points: newPoints };
                    } else {
                        const dxTime = snappedPoint.time - interaction.startPoint.time;
                        const dyPrice = snappedPoint.price - interaction.startPoint.price;
                        if ('start' in moved) moved.start = { time: moved.start.time + dxTime, price: moved.start.price + dyPrice };
                        if ('end' in moved) moved.end = { time: moved.end.time + dxTime, price: moved.end.price + dyPrice };
                        if ('point' in moved) moved.point = { time: moved.point.time + dxTime, price: moved.point.price + dyPrice };
                        if ('price' in moved) moved.price += dyPrice;
                        if ('p2' in moved) moved.p2 = { time: moved.p2.time + dxTime, price: moved.p2.price + dyPrice };
                        if ('anchor' in moved) moved.anchor = { time: moved.anchor.time + dxTime, price: moved.anchor.price + dyPrice };
                        if ('label' in moved) moved.label = { time: moved.label.time + dxTime, price: moved.label.price + dyPrice };
                        if ('entry' in moved) moved.entry = { time: moved.entry.time + dxTime, price: moved.entry.price + dyPrice };
                        if ('stop' in moved) moved.stop = { time: moved.stop.time + dxTime, price: moved.stop.price + dyPrice };
                        if ('profit' in moved) moved.profit = { time: moved.profit.time + dxTime, price: moved.profit.price + dyPrice };
                    }
                    setDrawings(prev => prev.map(d => d.id === interaction.drawingId ? moved : d));
                }
                break;
            }
            case 'resizing': {
                if (interaction.type === 'resizing') {
                    let resized = { ...interaction.initialDrawing } as any;
                    const h = interaction.handle;

                    if (h === 'start' || h === 'end') {
                        if (h === 'start') resized.start = snappedPoint;
                        else resized.end = snappedPoint;
                    }
                    else if (typeof h === 'string' && h.startsWith('p')) {
                        const idx = parseInt(h.substring(1));
                        if (!isNaN(idx) && resized.type === 'Path') {
                            const newPoints = [...resized.points];
                            newPoints[idx] = snappedPoint;
                            resized.points = newPoints;
                        }
                    }
                    else if (h === 'body') resized.price = snappedPoint.price;
                    else if (h === 'p2') resized.p2 = snappedPoint;
                    else if (h === 'p2_end') {
                        // Modifying Line 2 End
                        // We need to calculate where p2 (Line 2 Start) should be so that Line 2 passes through snappedPoint
                        // New P2 = SnappedPoint - Vector(Line 1)
                        // Vector(Line 1) = End - Start
                        const dxTime = resized.end.time - resized.start.time;
                        const dyPrice = resized.end.price - resized.start.price;
                        resized.p2 = {
                            time: snappedPoint.time - dxTime,
                            price: snappedPoint.price - dyPrice
                        };
                    }
                    else if (h === 'anchor') resized.anchor = snappedPoint;
                    else if (h === 'label') resized.label = snappedPoint;
                    else if (h === 'entry') resized.entry = snappedPoint;
                    else if (h === 'profit') resized.profit = { time: snappedPoint.time, price: snappedPoint.price };
                    else if (h === 'stop') resized.stop = { time: snappedPoint.time, price: snappedPoint.price };

                    setDrawings(prev => prev.map(d => d.id === interaction.drawingId ? resized : d));
                }
                break;
            }
            case 'scaling':
                if (interaction.type === 'scaling' && interaction.area === 'yAxis') {
                    const dy = e.clientY - interaction.startY;
                    const scaleFactor = 1 + dy * 0.003;
                    const range = interaction.initialPriceRange.max - interaction.initialPriceRange.min;
                    const center = (interaction.initialPriceRange.max + interaction.initialPriceRange.min) / 2;
                    const newRange = range * scaleFactor;
                    if (newRange > 0.000001) {
                        setPriceRange({ min: center - newRange / 2, max: center + newRange / 2 });
                    }
                } else if (interaction.type === 'scaling' && interaction.area === 'xAxis') {
                    const dx = e.clientX - interaction.startX;
                    const zoomSensitivity = 0.005;
                    const scaleFactor = Math.exp(dx * zoomSensitivity);

                    const newVisibleCandles = interaction.initialVisibleCandles * scaleFactor;
                    const initialRightIndex = interaction.initialStartIndex + interaction.initialVisibleCandles;
                    const newStartIndex = initialRightIndex - newVisibleCandles;

                    setView(getClampedViewState(newStartIndex, newVisibleCandles));
                }
                break;
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);

        // Commit Movement/Zoom state if changed
        if (interaction.type === 'panning' || (interaction.type === 'scaling' && interaction.area === 'xAxis')) {
            const hasChanged = Math.abs(view.startIndex - interaction.initialStartIndex) > 0.001 || Math.abs(view.visibleCandles - interaction.initialVisibleCandles) > 0.001;

            if (hasChanged) {
                // Reconstruct the state BEFORE the interaction using the initial view data preserved in 'interaction'
                const stateBeforeDrag: HistoryState = {
                    drawings: JSON.parse(JSON.stringify(drawings)),
                    indicators: JSON.parse(JSON.stringify(allActiveIndicators)),
                    view: { startIndex: interaction.initialStartIndex, visibleCandles: interaction.initialVisibleCandles },
                    priceRange: priceRange ? { ...priceRange } : null,
                    isAutoScaling,
                    chartType
                };
                setUndoStack(prev => [...prev.slice(-49), stateBeforeDrag]);
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
            commitDrawingChange(prev => prev);
            setInteraction({ type: 'none' });
            return;
        }

        if (currentDrawing) {
            if (currentDrawing.type === 'Brush') {
                // Apply Ramer-Douglas-Peucker simplification on finish
                const rawPoints = (currentDrawing as BrushDrawing).points;
                // Convert to screen pixels for simplification
                const screenPoints = rawPoints.map(p => ({ x: timeToX(p.time), y: yScale(p.price) }));

                // RDP Algorithm
                const rdpCheck = (pts: typeof screenPoints, epsilon: number): typeof screenPoints => {
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
                const simplifiedDataPoints = simplifiedScreenPoints.map(sp => ({
                    time: xToTime(sp.x),
                    price: yToPrice(sp.y)
                }));

                const finalBrush = { ...currentDrawing, points: simplifiedDataPoints };

                commitDrawingChange(prev => [...prev, finalBrush as Drawing]);
                setCurrentDrawing(null);
                setActiveTool(null);
                setInteraction({ type: 'none' });
                return;
            }

            if (interaction.type === 'drawing') {
                // Check for "Drag-to-Draw" completion
                const isTwoPointTool = ['Trend Line', 'Ray', 'Horizontal Ray', 'Rectangle', 'Arrow', 'Price Range', 'Date Range', 'Date & Price Range', 'Fibonacci Retracement', 'Gann Box', 'Callout'].includes(currentDrawing.type);

                let hasDragged = false;
                if (isTwoPointTool) {
                    const d = currentDrawing as any;
                    // Basic drag detection (if start and end are different enough)
                    // Check for undefined to avoid crashes with Callout vs others
                    if (d.type === 'Callout') {
                        if (d.anchor && d.label) {
                            hasDragged = Math.abs(d.anchor.time - d.label.time) > 0 || Math.abs(d.anchor.price - d.label.price) > 0;
                        }
                    } else {
                        if (d.start && d.end) {
                            hasDragged = Math.abs(d.start.time - d.end.time) > 0 || Math.abs(d.start.price - d.end.price) > 0;
                        }
                    }
                }

                if (isTwoPointTool && hasDragged) {
                    // FINISH: Drag-and-Release
                    const { step, ...drawing } = currentDrawing;
                    commitDrawingChange(prev => [...prev, drawing as Drawing]);
                    if (currentDrawing.type === 'Callout') {
                        const d = drawing as CalloutDrawing;
                        setEditingText({ drawing: d, x: timeToX(d.label.time), y: yScale(d.label.price) });
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
                        const dist = Math.hypot(d.start.time - d.end.time, d.start.price - d.end.price);
                        // Note: time/price are different units, but direct comparison tells us if they are identical
                        if (d.start.time !== d.end.time || d.start.price !== d.end.price) {
                            // Dragged significant amount
                            setCurrentDrawing(prev => prev ? { ...prev, step: 2 } as CurrentDrawingState : null);
                        }
                        // Else: Do nothing, stay in Step 1 (Waiting for End point click)
                    } else {
                        setCurrentDrawing(prev => prev ? { ...prev, step: 2 } as CurrentDrawingState : null);
                    }
                } else if (currentDrawing.step === 2 && currentDrawing.type === 'Parallel Channel') {
                    // ADVANCE: Channel needs 3 clicks
                    // Do nothing on pointer up, wait for click 3 (handled in pointer down) or drag finish?
                }
            }
        }

        // Toggle crosshair visibility on single tap (Mobile)
        if (isMobile && tapDetectionRef.current && (interaction.type === 'panning' || interaction.type === 'crosshair')) {
            const { x, y, time, wasVisible } = tapDetectionRef.current;
            const dist = Math.hypot(e.clientX - x, e.clientY - y);
            const elapsed = Date.now() - time;
            if (dist < 10 && elapsed < 300) {
                if (wasVisible) {
                    setTooltip(prev => ({ ...prev, visible: false }));
                }
            }
        }
        tapDetectionRef.current = null;

        if (interaction.type === 'panning' || interaction.type === 'scaling' || interaction.type === 'dragging_position_line') {
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

        if (interaction.type !== 'none' && interaction.type !== 'drawing' && interaction.type !== 'pinching') {
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
        } else if (currentDrawing?.type === 'Path') {
            // Finalize Path drawing on double click
            const { step, ...drawing } = currentDrawing;
            // Remove the ghost point which is the last point
            const finalDrawing = { ...drawing, points: drawing.points.slice(0, -1) };
            commitDrawingChange(prev => [...prev, finalDrawing as Drawing]);
            setCurrentDrawing(null);
            setActiveTool(null);
            setInteraction({ type: 'none' });
        }
    };

    const handleCopyChart = async () => { if (chartCanvasRef.current) { chartCanvasRef.current.toBlob(blob => { if (blob) { navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); alert('Chart copied to clipboard!'); } }); } };
    const onLockVerticalLine = (time: number) => { setLockedVerticalLineTime(prev => prev === time ? null : time); };

    const handleExecuteOrder = async (side: TradeDirection, orderType: string) => { const latestPrice = data.length > 0 ? data[data.length - 1].close : 0; const newPos: Omit<Position, 'id'> = { symbol: props.symbol, account: assetType, direction: side, quantity: parseFloat(order.quantity), entryPrice: orderType === 'Market' ? latestPrice : parseFloat(order.price), stopLoss: parseFloat(order.sl), takeProfit: parseFloat(order.tp), status: orderType === 'Market' ? PositionStatus.OPEN : PositionStatus.PENDING, openTime: new Date().toISOString(), pnl: 0 }; await api.createPosition(newPos); };
    const handleModifyPosition = async (id: string, vals: { sl: number, tp: number }) => { await api.updatePosition(id, vals); }
    const handleClosePosition = async (id: string) => { await api.closePosition(id, headerOhlc?.close || 0); }
    const handleCancelOrder = async (id: string) => { await api.cancelPosition(id); }
    const handleReversePosition = async (id: string) => { await api.reversePosition(id, headerOhlc?.close || 0); }

    const handleToolAction = (action: string) => {
        switch (action) {
            case 'draw': setMobileDrawingModalOpen(true); break;
            case 'indicators': setIndicatorPanelOpen(true); break;
            case 'watchlist': setRightPanel('watchlist'); break;
            case 'more': setMobileMoreMenuOpen(true); break;
        }
    }

    const renderDrawingsAndOverlays = () => {
        const drawingsToRender = [...drawings, currentDrawing].filter(d => d && d.isVisible !== false) as (Drawing | CurrentDrawing)[];

        const renderHandle = (cx: number, cy: number, cursor: string = 'move') => (
            <g key={`h-${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r={HANDLE_RADIUS + 3} fill="transparent" cursor={cursor} />
                <circle cx={cx} cy={cy} r={HANDLE_RADIUS} fill="#1f1f1f" stroke="#3B82F6" strokeWidth="2" style={{ pointerEvents: 'none' }} />
            </g>
        );

        const getSmoothPath = (points: { x: number, y: number }[]) => {
            if (points.length < 2) return "";
            if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

            let d = `M ${points[0].x} ${points[0].y}`;
            // Quadratic Bezier from p[i] to p[i+1] using p[i] as control? 
            // Better: Use midpoints. 
            // From P0 to P1... 
            // Curve from (Start) to (Mid between P_current and P_next)

            // Start at P0.
            // For i=1 to N-2:
            //    Control = Pi
            //    End = Mid(Pi, Pi+1)
            //    Q Control End
            // Last line to PN

            for (let i = 1; i < points.length - 1; i++) {
                const cp = points[i];
                const next = points[i + 1];
                const end = { x: (cp.x + next.x) / 2, y: (cp.y + next.y) / 2 };
                d += ` Q ${cp.x} ${cp.y} ${end.x} ${end.y}`;
            }
            // Line to last point
            const last = points[points.length - 1];
            d += ` L ${last.x} ${last.y}`;

            return d;
        };

        return <>
            {drawingsToRender.map(d => {
                const isSelected = selectedDrawingId === d.id;
                const key = d.id;
                let style = d.style;

                if (currentDrawing && d.id === currentDrawing.id) {
                    style = {
                        ...d.style,
                        color: '#60A5FA',
                        width: Math.max(d.style.width, 2),
                    };
                }

                const strokeDasharray = style.lineStyle === 'dashed' ? '8 4' : style.lineStyle === 'dotted' ? '2 6' : undefined;

                switch (d.type) {
                    case 'Trend Line': case 'Ray': {
                        if (!d.start || !d.end) return null;
                        const startX = timeToX(d.start.time), startY = yScale(d.start.price);
                        const endX = timeToX(d.end.time), endY = yScale(d.end.price);
                        let targetX = endX, targetY = endY;
                        if (d.type === 'Ray') {
                            const dx = endX - startX, dy = endY - startY;
                            if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
                                const len = Math.sqrt(dx * dx + dy * dy);
                                const extension = chartDimensions.width + chartDimensions.height;
                                targetX = startX + (dx / len) * extension;
                                targetY = startY + (dy / len) * extension;
                            }
                        }

                        let infoBox = null;
                        if (currentDrawing && d.id === currentDrawing.id && d.start.time !== d.end.time) {
                            const priceDelta = d.end.price - d.start.price;
                            const pricePercent = d.start.price !== 0 ? (priceDelta / d.start.price) * 100 : 0;
                            const timeDelta = d.end.time - d.start.time;
                            const barDelta = Math.round(timeDelta / candleInterval);
                            const angle = Math.atan2(-(endY - startY), endX - startX) * (180 / Math.PI);

                            const infoText = [
                                `${priceDelta.toFixed(5)} (${pricePercent.toFixed(2)}%)`,
                                `${barDelta} bars`,
                                `${angle.toFixed(1)}°`
                            ];

                            const textWidth = 120, textHeight = 60;
                            let boxX = (startX + endX) / 2 + 15;
                            let boxY = (startY + endY) / 2 - textHeight / 2;
                            if (boxX + textWidth > chartDimensions.width) boxX = (startX + endX) / 2 - textWidth - 15;
                            boxY = Math.max(5, Math.min(boxY, chartDimensions.height - textHeight - 5));

                            infoBox = (
                                <g transform={`translate(${boxX}, ${boxY})`} style={{ pointerEvents: 'none' }}>
                                    <rect width={textWidth} height={textHeight} rx="4" fill="rgba(31, 41, 55, 0.8)" stroke="#60A5FA" strokeWidth="1" />
                                    {infoText.map((text, i) => (
                                        <text key={i} x="10" y={20 + i * 16} fill="#E5E7EB" fontSize="11">{text}</text>
                                    ))}
                                </g>
                            );
                        }

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <line x1={startX} y1={startY} x2={targetX} y2={targetY} stroke="transparent" strokeWidth={HITBOX_WIDTH} cursor="move" />
                            <line x1={startX} y1={startY} x2={targetX} y2={targetY} stroke={style.color} strokeWidth={style.width} strokeDasharray={strokeDasharray} strokeLinecap="round" />
                            {isSelected && <>
                                {renderHandle(startX, startY)}
                                {renderHandle(endX, endY)}
                            </>}
                            {infoBox}
                        </g>;
                    }
                    case 'Horizontal Line': {
                        const y = yScale(d.price);
                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <line x1="0" y1={y} x2={chartDimensions.width} y2={y} stroke="transparent" strokeWidth={HITBOX_WIDTH} cursor="ns-resize" />
                            <line x1="0" y1={y} x2={chartDimensions.width} y2={y} stroke={style.color} strokeWidth={style.width} strokeDasharray={strokeDasharray} />
                        </g>;
                    }
                    case 'Horizontal Ray': {
                        if (!d.start) return null;
                        const startX = timeToX(d.start.time), y = yScale(d.start.price);
                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <line x1={startX} y1={y} x2={chartDimensions.width} y2={y} stroke="transparent" strokeWidth={HITBOX_WIDTH} cursor="move" />
                            <line x1={startX} y1={y} x2={chartDimensions.width} y2={y} stroke={style.color} strokeWidth={style.width} strokeDasharray={strokeDasharray} />
                            {isSelected && renderHandle(startX, y)}
                        </g>;
                    }
                    case 'Rectangle': {
                        if (!d.start || !d.end) return null;
                        const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                        const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];
                        const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x1 - x2), h = Math.abs(y1 - y2);
                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <rect x={x} y={y} width={w} height={h} fill={style.fillColor || 'transparent'} stroke={style.color} strokeWidth={style.width} strokeDasharray={strokeDasharray} cursor="move" />
                            {isSelected && <>{renderHandle(x1, y1, 'nwse-resize')} {renderHandle(x2, y2, 'nwse-resize')}</>}
                        </g>;
                    }
                    case 'Fibonacci Retracement': {
                        if (!d.start || !d.end) return null;
                        const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                        const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];
                        const priceDiff = d.end.price - d.start.price;

                        // Default Settings fallback
                        const settings = d.style.fibSettings || {
                            trendLine: { visible: true, color: style.color, width: 1, style: 'dashed' },
                            levels: FIB_LEVELS.map((l, i) => ({ level: l, color: FIB_LEVEL_COLORS[i] || style.color, visible: true })),
                            extendLines: false,
                            showBackground: true,
                            backgroundTransparency: 0.85,
                            useLogScale: false
                        };

                        const x_min = Math.min(x1, x2);
                        const x_max = Math.max(x1, x2);
                        const width = x_max - x_min;

                        // Filter visible levels and sort
                        const activeLevels = settings.levels.filter(l => l.visible).sort((a, b) => a.level - b.level);
                        const opacity = 1 - Math.max(0, Math.min(1, settings.backgroundTransparency));

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            {/* Background Fills */}
                            {settings.showBackground && activeLevels.slice(0, -1).map((l, i) => {
                                const next = activeLevels[i + 1];
                                const y_start = yScale(d.start.price + priceDiff * l.level);
                                const y_end = yScale(d.start.price + priceDiff * next.level);
                                const h = Math.abs(y_start - y_end);
                                const y = Math.min(y_start, y_end);
                                // Use color of the *current* level for the band (standard TradingView behavior) or mix? 
                                // TradingView uses the color of the level.
                                return <rect key={`fill-${i}`} x={settings.extendLines ? 0 : x_min} y={y} width={settings.extendLines ? chartDimensions.width : width} height={h} fill={l.color} fillOpacity={opacity * 0.5} />
                            })}

                            {/* Trend Line */}
                            {settings.trendLine.visible && (
                                <line
                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={settings.trendLine.color}
                                    strokeWidth={settings.trendLine.width}
                                    strokeDasharray={settings.trendLine.style === 'dashed' ? '4 4' : settings.trendLine.style === 'dotted' ? '1 4' : undefined}
                                />
                            )}

                            {/* Grid Lines & Labels */}
                            {activeLevels.map((l, i) => {
                                const price = d.start.price + priceDiff * l.level;
                                const y = yScale(price);
                                const textX = settings.extendLines
                                    ? (d.start.time < d.end.time ? chartDimensions.width - 50 : 50) // Simplified
                                    : (d.start.time < d.end.time ? x2 + 5 : x2 - 5);
                                const textAnchor = d.start.time < d.end.time ? "start" : "end";
                                const label = `${l.level.toFixed(3)} (${formatPrice(price)})`;

                                return <g key={`grid-${i}`}>
                                    <line
                                        x1={settings.extendLines ? 0 : x_min}
                                        y1={y}
                                        x2={settings.extendLines ? chartDimensions.width : x_max}
                                        y2={y}
                                        stroke={l.color}
                                        strokeWidth={style.width}
                                    />
                                    <text x={textX} y={y - 4} fill={l.color} fontSize="10" textAnchor={textAnchor} style={{ pointerEvents: 'none' }}>{label}</text>
                                </g>;
                            })}

                            {isSelected && <>
                                {renderHandle(x1, y1)}
                                {renderHandle(x2, y2)}
                            </>}
                        </g>;
                    }
                    case 'Gann Box': {
                        if (!d.start || !d.end) return null;
                        const [x1, y1] = [timeToX(d.start.time), yScale(d.start.price)];
                        const [x2, y2] = [timeToX(d.end.time), yScale(d.end.price)];

                        // Use bounding box for consistent 0-1 regardless of draw direction
                        const x = Math.min(x1, x2), y = Math.min(y1, y2);
                        const w = Math.abs(x1 - x2), h = Math.abs(y1 - y2);

                        // Resolve Settings
                        const settings = d.style.gannSettings || {
                            priceLevels: GANN_LEVELS.map((l, i) => ({ level: l, color: GANN_LEVEL_COLORS[i] || d.style.color, visible: true })),
                            timeLevels: GANN_LEVELS.map((l, i) => ({ level: l, color: GANN_LEVEL_COLORS[i] || d.style.color, visible: true })),
                            useLeftLabels: true, useRightLabels: true, useTopLabels: true, useBottomLabels: true,
                            showBackground: true, backgroundTransparency: 0.9
                        };

                        const activeTimeLevels = settings.timeLevels.filter(l => l.visible).sort((a, b) => a.level - b.level);
                        const activePriceLevels = settings.priceLevels.filter(l => l.visible).sort((a, b) => a.level - b.level);

                        const opacity = 1 - Math.max(0, Math.min(1, settings.backgroundTransparency));


                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            {/* Background Fills - Intersecting Strips */}
                            {settings.showBackground && <>
                                {/* Time Strips */}
                                {activeTimeLevels.slice(0, -1).map((l, i) => {
                                    const next = activeTimeLevels[i + 1];
                                    const vx = x + w * l.level;
                                    const vw = w * (next.level - l.level);
                                    if (vw <= 0) return null;
                                    return <rect key={`t-fill-${i}`} x={vx} y={y} width={vw} height={h} fill={l.color} fillOpacity={opacity * 0.5} />
                                })}
                                {/* Price Strips */}
                                {activePriceLevels.slice(0, -1).map((l, i) => {
                                    const next = activePriceLevels[i + 1];
                                    const hy = y + h * l.level;
                                    const hh = h * (next.level - l.level);
                                    if (hh <= 0) return null;
                                    return <rect key={`p-fill-${i}`} x={x} y={hy} width={w} height={hh} fill={l.color} fillOpacity={opacity * 0.5} />
                                })}
                            </>}

                            {/* Grid Lines & Labels */}
                            {/* Time Levels (Vertical) */}
                            {activeTimeLevels.map((l, i) => {
                                const lx = x + w * l.level;
                                return <g key={`t-grid-${i}`}>
                                    <line x1={lx} y1={y} x2={lx} y2={y + h} stroke={l.color} strokeWidth={1} strokeOpacity={0.8} />
                                    {settings.useTopLabels && l.level >= 0 && l.level <= 1 &&
                                        <text x={lx} y={y - 5} fill={l.color} fontSize={10} textAnchor="middle">{l.level}</text>}
                                    {settings.useBottomLabels && l.level >= 0 && l.level <= 1 &&
                                        <text x={lx} y={y + h + 12} fill={l.color} fontSize={10} textAnchor="middle">{l.level}</text>}
                                </g>
                            })}

                            {/* Price Levels (Horizontal) */}
                            {activePriceLevels.map((l, i) => {
                                const ly = y + h * l.level;
                                return <g key={`p-grid-${i}`}>
                                    <line x1={x} y1={ly} x2={x + w} y2={ly} stroke={l.color} strokeWidth={1} strokeOpacity={0.8} />
                                    {settings.useRightLabels && l.level >= 0 && l.level <= 1 &&
                                        <text x={x + w + 5} y={ly + 3} fill={l.color} fontSize={10} textAnchor="start">{l.level}</text>}
                                    {settings.useLeftLabels && l.level >= 0 && l.level <= 1 &&
                                        <text x={x - 5} y={ly + 3} fill={l.color} fontSize={10} textAnchor="end">{l.level}</text>}
                                </g>
                            })}

                            {/* Outer Border */}
                            <rect x={x} y={y} width={w} height={h} fill="none" stroke={style.color} strokeWidth={style.width} />

                            {/* Diagonals */}
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.color} strokeWidth={0.5} strokeDasharray="2 2" />
                            <line x1={x1} y1={y2} x2={x2} y2={y1} stroke={style.color} strokeWidth={0.5} strokeDasharray="2 2" />

                            {isSelected && <>{renderHandle(x1, y1, 'nwse-resize')} {renderHandle(x2, y2, 'nwse-resize')}</>}
                        </g>;
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

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            {/* Fill Area with Polygon */}
                            <polygon points={`${x1},${y1} ${x2},${y2} ${l2_x2},${l2_y2} ${l2_x1},${l2_y1}`} fill={style.fillColor || 'rgba(59, 130, 246, 0.1)'} stroke="none" />

                            {/* Line 1 (Defined by Start/End) */}
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={style.color} strokeWidth={style.width} />

                            {/* Line 2 (Defined by P2 + Vector) */}
                            <line x1={l2_x1} y1={l2_y1} x2={l2_x2} y2={l2_y2} stroke={style.color} strokeWidth={style.width} />

                            {/* Centerline (Average) */}
                            <line x1={c_x1} y1={c_y1} x2={c_x2} y2={c_y2} stroke={style.color} strokeWidth={1} strokeDasharray="6 4" strokeOpacity="0.8" />

                            {isSelected && <>
                                {renderHandle(x1, y1)}
                                {renderHandle(x2, y2)}
                                {renderHandle(l2_x1, l2_y1, 'move')}
                                {renderHandle(l2_x2, l2_y2, 'move')}
                            </>}
                        </g>;
                    }


                    case 'Text Note': {
                        if (editingText?.drawing.id === d.id) return null;
                        if (!d.point) return null;
                        const x = timeToX(d.point.time);
                        const y = yScale(d.point.price);

                        // Measure text
                        const fontSize = style.fontSize || 14;
                        const padding = 8;
                        const textWidth = d.text.length * (fontSize * 0.6) + padding * 2;
                        const textHeight = fontSize + padding * 2;

                        return <g key={key} cursor="move" filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            {/* Background for better readability */}
                            <rect x={x} y={y - textHeight + padding} width={textWidth} height={textHeight} fill="rgba(31, 41, 55, 0.7)" rx="4" />
                            <text x={x + padding} y={y} fill={style.color} fontSize={fontSize} style={{ pointerEvents: 'none' }}>{d.text}</text>
                            {isSelected && renderHandle(x, y - textHeight / 2)}
                        </g>;
                    }
                    case 'Vertical Line': {
                        const x = timeToX(d.time);
                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <line x1={x} y1={0} x2={x} y2={chartDimensions.height} stroke="transparent" strokeWidth={HITBOX_WIDTH} cursor="ew-resize" />
                            <line x1={x} y1={0} x2={x} y2={chartDimensions.height} stroke={style.color} strokeWidth={style.width} strokeDasharray={strokeDasharray} />
                        </g>;
                    }
                    case 'Arrow': {
                        if (!d.start || !d.end) return null;
                        const [startX, startY] = [timeToX(d.start.time), yScale(d.start.price)];
                        const [endX, endY] = [timeToX(d.end.time), yScale(d.end.price)];
                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <defs>
                                <marker id={`arrowhead-${d.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill={style.color} />
                                </marker>
                            </defs>
                            <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="transparent" strokeWidth={HITBOX_WIDTH} cursor="move" />
                            <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={style.color} strokeWidth={style.width} markerEnd={`url(#arrowhead-${d.id})`} />
                            {isSelected && <>{renderHandle(startX, startY)} {renderHandle(endX, endY)}</>}
                        </g>;
                    }
                    case 'Path': {
                        const points = d.points.map(p => ({ x: timeToX(p.time), y: yScale(p.price) }));
                        const pathData = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <path d={pathData} stroke="transparent" strokeWidth={HITBOX_WIDTH} fill="none" cursor="move" />
                            <path d={pathData} stroke={style.color} strokeWidth={style.width} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                            {isSelected && d.points.map((p, i) => {
                                const x = timeToX(p.time);
                                const y = yScale(p.price);
                                return <g key={`handle-${i}`}>{renderHandle(x, y)}</g>;
                            })}
                        </g>;
                    }
                    case 'Brush': {
                        const points = d.points.map(p => ({ x: timeToX(p.time), y: yScale(p.price) }));
                        const smoothPath = getSmoothPath(points);

                        // Calculate bounding box for single handle/selection visual
                        const xs = points.map(p => p.x);
                        const ys = points.map(p => p.y);
                        const minX = Math.min(...xs), maxX = Math.max(...xs);
                        const minY = Math.min(...ys), maxY = Math.max(...ys);

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <path d={smoothPath} stroke="transparent" strokeWidth={HITBOX_WIDTH} fill="none" cursor="move" />
                            <path d={smoothPath} stroke={style.color} strokeWidth={style.width} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                            {isSelected && (
                                <rect x={minX - 5} y={minY - 5} width={maxX - minX + 10} height={maxY - minY + 10}
                                    fill="transparent" stroke={style.color} strokeWidth={1} strokeDasharray="4 4"
                                    className="pointer-events-none"
                                />
                            )}
                        </g>;
                    }
                    case 'Callout': {
                        if (editingText?.drawing.id === d.id) return null;
                        if (!d.anchor || !d.label) return null; // Add safety check for undefined properties
                        const [anchorX, anchorY] = [timeToX(d.anchor.time), yScale(d.anchor.price)];
                        const [labelX, labelY] = [timeToX(d.label.time), yScale(d.label.price)];

                        // Measure text
                        const fontSize = 12;
                        const padding = 8;
                        const textWidth = (d.text.length * (fontSize * 0.6)) + padding * 3; // a bit wider
                        const textHeight = fontSize + padding * 2 + 10;

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                            <line x1={anchorX} y1={anchorY} x2={labelX} y2={labelY} stroke={style.color} strokeWidth={1} />
                            {/* Centered box at label point */}
                            <rect x={labelX - textWidth / 2} y={labelY - textHeight / 2} width={textWidth} height={textHeight} fill="rgba(31, 41, 55, 0.9)" stroke={style.color} rx="4" cursor="move" />
                            <text x={labelX} y={labelY} fill={style.color} fontSize={fontSize} textAnchor="middle" alignmentBaseline="middle" style={{ pointerEvents: 'none' }}>{d.text}</text>
                            {isSelected && <>{renderHandle(anchorX, anchorY)} {renderHandle(labelX, labelY)}</>}
                        </g>;
                    }
                    case 'Long Position':
                    case 'Short Position': {
                        if (!d.entry || !d.profit || !d.stop) return null;
                        const isLong = d.type === 'Long Position';
                        const profitColor = '#10B981';
                        const stopColor = '#EF4444';

                        const entryPos = { x: timeToX(d.entry.time), y: yScale(d.entry.price) };
                        const profitPos = { x: timeToX(d.profit.time), y: yScale(d.profit.price) };
                        const stopPos = { x: timeToX(d.stop.time), y: yScale(d.stop.price) };

                        // Calculate Stats
                        const entryPrice = d.entry.price;
                        const profitPrice = d.profit.price;
                        const stopPrice = d.stop.price;

                        const profitDiff = Math.abs(profitPrice - entryPrice);
                        const stopDiff = Math.abs(entryPrice - stopPrice);
                        const riskReward = stopDiff > 0 ? (profitDiff / stopDiff).toFixed(2) : '∞';

                        const targetPct = ((Math.abs(profitPrice - entryPrice) / entryPrice) * 100).toFixed(2);
                        const stopPct = ((Math.abs(stopPrice - entryPrice) / entryPrice) * 100).toFixed(2);

                        const boxWidth = Math.max(Math.abs(profitPos.x - entryPos.x), 50); // Min width visual
                        const x = Math.min(entryPos.x, profitPos.x);
                        // Ensure profit/stop Ys are correct relative to entry for visual box
                        // Visual Y ranges:
                        // Long: Profit is Above Entry (smaller Y), Stop is Below Entry (larger Y)
                        // Short: Profit is Below Entry (larger Y), Stop is Above Entry (smaller Y)

                        // We use the actual Y coords from scale which handles this inversing automatically
                        const profitRectY = Math.min(entryPos.y, profitPos.y);
                        const profitRectH = Math.abs(entryPos.y - profitPos.y);

                        const stopRectY = Math.min(entryPos.y, stopPos.y);
                        const stopRectH = Math.abs(entryPos.y - stopPos.y);

                        // Panel Info
                        const panelX = Math.max(entryPos.x, profitPos.x) + 10;
                        const panelY = entryPos.y; // Centered on entry line? 

                        return <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} cursor="move" pointerEvents="auto">
                            {/* Profit Zone */}
                            <rect x={x} y={profitRectY} width={boxWidth} height={profitRectH}
                                fill="rgba(16, 185, 129, 0.2)" stroke={profitColor} strokeWidth={1} />

                            {/* Stop Zone */}
                            <rect x={x} y={stopRectY} width={boxWidth} height={stopRectH}
                                fill="rgba(239, 68, 68, 0.2)" stroke={stopColor} strokeWidth={1} />

                            {/* Entry Line */}
                            <line x1={x} y1={entryPos.y} x2={x + boxWidth} y2={entryPos.y} stroke={style.color} strokeWidth={1} />

                            {/* Detailed Stats Label Floating Right */}
                            <g transform={`translate(${panelX}, ${panelY - 35})`} style={{ pointerEvents: 'none' }}>
                                <rect width="110" height="70" rx="4" fill="rgba(31, 41, 55, 0.95)" stroke={style.color} strokeWidth={1} />

                                {/* Target Info */}
                                <text x="10" y="16" fill={profitColor} fontSize="10" fontWeight="bold">Target</text>
                                <text x="100" y="16" fill={profitColor} fontSize="10" textAnchor="end">{profitPrice.toFixed(2)} ({targetPct}%)</text>

                                {/* Risk/Reward */}
                                <text x="10" y="38" fill="#9CA3AF" fontSize="11">R/R Ratio</text>
                                <text x="100" y="38" fill="white" fontSize="12" fontWeight="bold" textAnchor="end">{riskReward}</text>

                                {/* Stop Info */}
                                <text x="10" y="60" fill={stopColor} fontSize="10" fontWeight="bold">Stop</text>
                                <text x="100" y="60" fill={stopColor} fontSize="10" textAnchor="end">{stopPrice.toFixed(2)} ({stopPct}%)</text>
                            </g>

                            {isSelected && <>
                                {renderHandle(entryPos.x, entryPos.y, 'move')}
                                {renderHandle(profitPos.x, profitPos.y, 'move')}
                                {renderHandle(stopPos.x, stopPos.y, 'move')}
                            </>}
                        </g>
                    }
                    case 'Price Range':
                    case 'Date Range':
                    case 'Date & Price Range': {
                        if (!d.start || !d.end) return null;
                        const [x_start, y_start] = [timeToX(d.start.time), yScale(d.start.price)];
                        const [x_end, y_end] = [timeToX(d.end.time), yScale(d.end.price)];
                        const x = Math.min(x_start, x_end), y = Math.min(y_start, y_end);
                        const w = Math.abs(x_start - x_end), h = Math.abs(y_start - y_end);

                        const priceDelta = d.end.price - d.start.price;
                        const isUp = priceDelta >= 0;
                        const priceAbsDelta = Math.abs(priceDelta);
                        const pricePercent = d.start.price !== 0 ? (priceAbsDelta / d.start.price) * 100 : 0;
                        const timeDelta = Math.abs(d.end.time - d.start.time);
                        const barDelta = Math.round(timeDelta / candleInterval);

                        const bgColor = isUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                        const textColor = isUp ? '#34D399' : '#F87171';

                        const infoTexts: string[] = [];
                        if (d.type === 'Price Range' || d.type === 'Date & Price Range') {
                            infoTexts.push(`${priceDelta.toFixed(5)} (${pricePercent.toFixed(2)}%)`);
                        }
                        if (d.type === 'Date Range' || d.type === 'Date & Price Range') {
                            infoTexts.push(`${barDelta} bars`);
                        }
                        if (d.type === 'Date & Price Range') {
                            const days = (timeDelta / 86400).toFixed(1);
                            infoTexts.push(`${days} days`);
                        }

                        const textWidth = 140;
                        const textHeight = 18 + infoTexts.length * 16;

                        let boxX = x + w / 2 - textWidth / 2;
                        let boxY = y + h / 2 - textHeight / 2;

                        return (
                            <g key={key} filter={isSelected ? "url(#selectionGlow)" : "none"} pointerEvents="auto">
                                <rect x={x} y={y} width={w} height={h} fill={bgColor} stroke={style.color} strokeWidth={0.5} strokeDasharray="4 4" cursor="move" />
                                <g transform={`translate(${boxX}, ${boxY})`} style={{ pointerEvents: 'none' }}>
                                    <rect width={textWidth} height={textHeight} rx="4" fill="rgba(31, 41, 55, 0.8)" />
                                    {infoTexts.map((text, i) => (
                                        <text key={i} x={textWidth / 2} y={16 + i * 16} fill={textColor} fontSize="12" textAnchor="middle" fontWeight="bold">{text}</text>
                                    ))}
                                </g>
                                {isSelected && <>
                                    {renderHandle(x_start, y_start, 'nwse-resize')}
                                    {renderHandle(x_end, y_end, 'nwse-resize')}
                                    {renderHandle(x_start, y_end, 'nesw-resize')}
                                    {renderHandle(x_end, y_start, 'nesw-resize')}
                                </>}
                            </g>
                        );
                    }
                    default: return null;
                }
            })}
            {overlayIndicators.map(indicator => {
                if (!indicator.data) return null;
                if (indicator.isVisible === false) return null;

                // Common helper to get integer iterations for visible range
                // Fixes the "fractional index return undefined" bug
                const startIdx = Math.max(0, Math.floor(view.startIndex));
                const endIdx = Math.min(data.length, Math.ceil(view.startIndex + view.visibleCandles));

                // Helper to build path string
                const buildPath = (values: (number | null)[]) => {
                    const points: [number, number][] = [];
                    for (let i = startIdx; i < endIdx; i++) {
                        const val = values[i];
                        if (val !== null && val !== undefined) {
                            points.push([indexToX(i - view.startIndex), yScale(val)]);
                        }
                    }
                    if (points.length === 0) return '';
                    return points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p[0]},${p[1]}`).join(' ');
                };

                // Helper to build polygon points for fill
                const buildFill = (upper: (number | null)[], lower: (number | null)[]) => {
                    const topPoints: [number, number][] = [];
                    const bottomPoints: [number, number][] = [];

                    for (let i = startIdx; i < endIdx; i++) {
                        const u = upper[i];
                        const l = lower[i];
                        if (u !== null && u !== undefined && l !== null && l !== undefined) {
                            const x = indexToX(i - view.startIndex);
                            topPoints.push([x, yScale(u)]);
                            bottomPoints.unshift([x, yScale(l)]); // Reverse order for bottom
                        }
                    }

                    if (topPoints.length === 0) return '';
                    const allPoints = [...topPoints, ...bottomPoints];
                    return allPoints.map(p => `${p[0]},${p[1]}`).join(' ');
                };

                if (indicator.type === 'MA' || indicator.type === 'EMA' || indicator.type === 'VWAP') {
                    const path = buildPath(indicator.data.main || []);
                    return <path key={indicator.id} d={path} stroke={indicator.settings.color || '#2962FF'} strokeWidth="2" fill="none" pointerEvents="none" />;
                }

                if ((indicator.type as string) === 'Bollinger Bands' || indicator.type === 'BB') {
                    const upper = indicator.data.upper || [];
                    const lower = indicator.data.lower || [];
                    const middle = indicator.data.middle || [];

                    const fillPoints = buildFill(upper, lower);
                    const upperPath = buildPath(upper);
                    const lowerPath = buildPath(lower);
                    const middlePath = buildPath(middle);

                    return <g key={indicator.id} pointerEvents="none">
                        <polygon points={fillPoints} fill={indicator.settings.color || '#2962FF'} fillOpacity="0.1" stroke="none" />
                        <path d={upperPath} stroke={indicator.settings.color || '#2962FF'} strokeWidth="1" fill="none" />
                        <path d={lowerPath} stroke={indicator.settings.color || '#2962FF'} strokeWidth="1" fill="none" />
                        <path d={middlePath} stroke="#FF6D00" strokeWidth="1" fill="none" strokeOpacity="0.7" />
                    </g>;
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
                                        <path key={`${indicator.id}-${key}`} d={path} stroke={indicator.settings.ribbonBaseColor || '#2962FF'} strokeWidth="1" fill="none" strokeOpacity="0.6" pointerEvents="none" />
                                    );
                                }
                            }
                        });
                    }
                    return <g key={indicator.id}>{paths}</g>;
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
                                <line key={`${indicator.id}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" />
                            );
                        }
                    }
                    return <g key={indicator.id} pointerEvents="none">{segments}</g>;
                }

                return null;
            })}
        </>;
    }

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
            <div ref={fullscreenContainerRef} className="bg-black text-gray-300 flex flex-col h-full w-full overflow-hidden font-sans touch-none">
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
                        setChartType(t => t === 'Candle' ? 'Line' : 'Candle');
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
                    {!isMobile && <LeftToolbar tools={tools} activeTool={activeTool} onToolSelect={setActiveTool} />}

                    <div
                        ref={eventContainerRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerLeave}
                        onWheel={handleWheel}
                        onDoubleClick={handleDoubleClick}
                        onContextMenu={handleContextMenu}
                        className="flex-1 flex flex-col min-w-0 relative"
                        style={{ cursor: activeTool || placingOrderLine ? 'crosshair' : 'default' }}
                        tabIndex={0}
                    >
                        <div className="flex-1 flex flex-col min-h-0 relative">
                            <div className="flex-1 flex min-h-0 relative">
                                <div className="flex-1 min-w-0 relative" ref={chartContainerRef}>
                                    <canvas ref={chartCanvasRef} className="absolute inset-0 w-full h-full block" />
                                    <svg ref={svgRef} className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                                        <defs>
                                            <filter id="selectionGlow" x="-50%" y="-50%" width="200%" height="200%">
                                                <feGaussianBlur stdDeviation="3" result="coloredBlur" in="SourceGraphic" />
                                                <feMerge>
                                                    <feMergeNode in="coloredBlur" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                        </defs>
                                        {renderDrawingsAndOverlays()}
                                        {tooltip.visible && chartSettings.scalesAndLines.showCrosshair && (
                                            <g className="pointer-events-none">
                                                <line x1={0} y1={tooltip.y} x2={chartDimensions.width} y2={tooltip.y} stroke={chartSettings.scalesAndLines.crosshairColor} strokeWidth="1" strokeDasharray="4 4" />
                                                <line x1={tooltip.x} y1={0} x2={tooltip.x} y2={chartDimensions.height} stroke={chartSettings.scalesAndLines.crosshairColor} strokeWidth="1" strokeDasharray="4 4" />
                                            </g>
                                        )}
                                        {snapIndicator && <circle cx={snapIndicator.x} cy={snapIndicator.y} r="4" fill="none" stroke="#3B82F6" strokeWidth="2" className="pointer-events-none" />}
                                    </svg>

                                    {selectedDrawingId && floatingToolbarPos && (
                                        <FloatingDrawingToolbar
                                            drawing={drawings.find(d => d.id === selectedDrawingId)!}
                                            position={floatingToolbarPos}
                                            setPosition={(pos) => {
                                                setFloatingToolbarPos(pos);
                                                savedToolbarPos.current = pos;
                                                localStorage.setItem('drawingToolbarPos', JSON.stringify(pos));
                                            }}
                                            onUpdateStyle={(s) => commitDrawingChange(prev => prev.map(d => d.id === selectedDrawingId ? { ...d, style: s } : d))}
                                            onDelete={() => handleDeleteDrawing(selectedDrawingId)}
                                            onAlert={() => handleCreateDrawingAlert(drawings.find(d => d.id === selectedDrawingId)!)}
                                            onClone={handleCloneDrawing}
                                            onUpdateDrawing={handleUpdateDrawing}
                                            onDragEnd={(pos) => {
                                                savedToolbarPos.current = pos;
                                                localStorage.setItem('drawingToolbarPos', JSON.stringify(pos));
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
                                            (interaction.type === 'moving' || interaction.type === 'resizing')
                                                ? drawings.find(d => d.id === interaction.drawingId)
                                                : null
                                        }
                                        onEditAlert={handleEditAlert}
                                    />

                                    {editingText && (
                                        <textarea
                                            ref={textInputRef}
                                            value={editingText.drawing.text}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setEditingText(prev => prev ? { ...prev, drawing: { ...prev.drawing, text: val } } : null);
                                                setDrawings(prev => prev.map(d => d.id === editingText.drawing.id ? { ...d, text: val } as any : d));
                                            }}
                                            onBlur={() => { commitCurrentState(); setEditingText(null); }}
                                            style={{
                                                position: 'absolute',
                                                left: editingText.x,
                                                top: editingText.y,
                                                color: editingText.drawing.style.color,
                                                fontSize: editingText.drawing.style.fontSize || 14,
                                                background: 'transparent',
                                                border: '1px solid #555',
                                                outline: 'none',
                                                resize: 'none',
                                                overflow: 'hidden'
                                            }}
                                        />
                                    )}

                                    {/* Chart Navigation - visible on all devices now */}
                                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 opacity-0 hover:opacity-100 transition-opacity duration-300 p-6 pointer-events-none">
                                        <div className="pointer-events-auto">
                                            <ChartNavigation
                                                onZoom={(dir) => setView(v => getClampedViewState(v.startIndex, v.visibleCandles * (dir > 0 ? 0.9 : 1.1)))}
                                                onPan={(dir) => setView(v => getClampedViewState(v.startIndex + dir * 5, v.visibleCandles))}
                                                onReset={resetView}
                                                canPanToOlderData={view.startIndex > 0}
                                                canPanToNewerData={view.startIndex < data.length - view.visibleCandles}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="w-16 flex-shrink-0 border-l border-gray-800 cursor-ns-resize" ref={yAxisContainerRef}>
                                    <canvas ref={yAxisCanvasRef} className="w-full h-full block" />
                                </div>

                                {rightPanel && (
                                    isMobile ? (
                                        <>
                                            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setRightPanel(null)} />
                                            <div
                                                className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 rounded-t-xl shadow-2xl flex flex-col transition-all duration-75 ease-out"
                                                style={{ height: `${mobilePanelHeight}px` }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div
                                                    className="w-full h-6 flex items-center justify-center cursor-ns-resize touch-none border-b border-gray-800 flex-shrink-0 hover:bg-gray-800/50 transition-colors"
                                                    onPointerDown={handleMobilePanelResizeStart}
                                                >
                                                    <div className="w-12 h-1.5 bg-gray-600 rounded-full" />
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
                                                        onToggleDrawingVisibility={handleToggleDrawingVisibility}
                                                        onDeleteIndicator={handleRemoveIndicator}
                                                        onToggleIndicatorVisibility={handleToggleIndicatorVisibility}
                                                        currentPrice={headerOhlc?.close || 0}
                                                        order={order}
                                                        setOrder={setOrder}
                                                        placingOrderLine={placingOrderLine}
                                                        onPlaceLine={setPlacingOrderLine}
                                                        onExecuteOrder={handleExecuteOrder}
                                                        assetType={assetType === 'Binance' ? 'Crypto' : 'Forex'}
                                                        forexAccountBalance={forexBalanceValue}
                                                        cryptoAccountBalance={binanceBalanceValue}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            className="bg-gray-900 border-l border-gray-700/50 flex-shrink-0 relative"
                                            style={{ width: `${rightPanelWidth}px` }}
                                        >
                                            <div onPointerDown={handleResizePointerDown} className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-10" />
                                            <SidePanels
                                                panel={rightPanel}
                                                onClose={() => setRightPanel(null)}
                                                hoveredCandle={headerOhlc}
                                                symbol={props.symbol}
                                                onSymbolSelect={props.onSymbolChange}
                                                drawings={drawings}
                                                indicators={allActiveIndicators}
                                                onDeleteDrawing={handleDeleteDrawing}
                                                onToggleDrawingVisibility={handleToggleDrawingVisibility}
                                                onDeleteIndicator={handleRemoveIndicator}
                                                onToggleIndicatorVisibility={handleToggleIndicatorVisibility}
                                                currentPrice={headerOhlc?.close || 0}
                                                order={order}
                                                setOrder={setOrder}
                                                placingOrderLine={placingOrderLine}
                                                onPlaceLine={setPlacingOrderLine}
                                                onExecuteOrder={handleExecuteOrder}
                                                assetType={assetType === 'Binance' ? 'Crypto' : 'Forex'}
                                                forexAccountBalance={forexBalanceValue}
                                                cryptoAccountBalance={binanceBalanceValue}
                                            />
                                        </div>
                                    )
                                )}
                            </div>
                            <div className="h-[30px] flex border-t border-gray-800">
                                <div className="flex-1 cursor-ew-resize overflow-hidden" ref={xAxisContainerRef}>
                                    <canvas ref={xAxisCanvasRef} className="w-full h-full block" />
                                </div>
                                <div className="w-16 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex items-center justify-center">
                                    <button onClick={() => setSettingsModalOpen(true)} className="text-gray-400 hover:text-white transition-colors" title="Chart Settings">
                                        <SettingsIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                {!isMobile && rightPanel && <div style={{ width: `${rightPanelWidth}px` }} className="flex-shrink-0 bg-gray-900 border-l border-gray-800" />}
                            </div>

                        </div>
                        <div ref={indicatorPanelsContainerRef} className="flex-shrink-0">
                            {panelIndicators.filter(i => i.isVisible !== false).map(indicator => (
                                <div key={indicator.id} className="h-32 border-t-2 border-gray-700 flex">
                                    <div className="flex-1 min-w-0">
                                        <canvas ref={el => {
                                            const currentRefs = indicatorCanvasRefs.current.get(indicator.id) || { chart: null, yAxis: null };
                                            indicatorCanvasRefs.current.set(indicator.id, { ...currentRefs, chart: el });
                                        }} className="w-full h-full" />
                                    </div>
                                    <div className="w-16 flex-shrink-0 border-l border-gray-800">
                                        <canvas ref={el => {
                                            const currentRefs = indicatorCanvasRefs.current.get(indicator.id) || { chart: null, yAxis: null };
                                            if (el) {
                                                indicatorCanvasRefs.current.set(indicator.id, { ...currentRefs, yAxis: el });
                                            }
                                        }} className="w-full h-full" />
                                    </div>
                                    {!isMobile && rightPanel && <div style={{ width: `${rightPanelWidth}px` }} className="flex-shrink-0 bg-gray-900 border-l border-gray-800" />}
                                </div>
                            ))}
                        </div>
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
                            onOpenAssistant={props.onOpenAssistant}
                        />
                        <ActiveIndicatorsDisplay
                            indicators={allActiveIndicators}
                            onEdit={setIndicatorToEdit}
                            onRemove={handleRemoveIndicator}
                            onToggleVisibility={handleToggleIndicatorVisibility}
                            onToggleAllVisibility={handleToggleAllIndicatorsVisibility}
                            onCreateAlert={handleCreateIndicatorAlert}
                        />
                    </div>
                    {!isMobile && <RightToolbar onTogglePanel={panel => setRightPanel(p => p === panel ? null : panel)} onOpenAssistant={props.onOpenAssistant} />}
                </div>

                {isIndicatorPanelOpen && <IndicatorPanel isOpen={isIndicatorPanelOpen} onClose={() => setIndicatorPanelOpen(false)} onAdd={handleAddIndicator} customScripts={props.customScripts} onAddCustom={handleAddCustomIndicator} strategyVisibility={strategyVisibility} onToggleStrategy={onToggleStrategyVisibility} />}
                {indicatorToEdit && <IndicatorSettingsModal indicator={indicatorToEdit} onClose={() => setIndicatorToEdit(null)} onSave={handleUpdateIndicator} />}
                {isSettingsModalOpen && <ChartSettingsModal settings={chartSettings} onClose={() => setSettingsModalOpen(false)} onSave={handleSaveSettings} />}

                {alertModalInfo.visible && (!!alertModalInfo.drawing || !!alertModalInfo.indicatorId) && (
                    <CreateAlertModal
                        symbol={props.symbol}
                        drawing={alertModalInfo.drawing || ({ type: 'Horizontal Line' } as Drawing)}
                        initialAlert={alertModalInfo.alertToEdit}
                        indicatorId={alertModalInfo.indicatorId}
                        indicatorType={alertModalInfo.indicatorType}
                        onClose={() => setAlertModalInfo({ visible: false, drawing: null, alertToEdit: null })}
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
                            console.log("Add simple alert at", price);
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

