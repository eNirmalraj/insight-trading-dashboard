// cspell:ignore hitbox gann ohlc vwma macd bollinger vwap donchian ichimoku keltner watchlist forex recalc dema tema smma zlema swma linreg defval minval maxval ampm retracement trendline
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { Position, PositionStatus, TradeDirection, Strategy } from '../../types';
import AlertToast from './AlertToast';
// AlertSlidePanel removed — using expanded toast editor instead
import * as api from '../../api';
import indicatorService from '../../services/indicatorService';
import * as priceAlertService from '../../services/alertService';
import { createAlertWithDefaults, updateAlert, deleteAlert } from '../../services/alertService';
import { saveMarketState } from '../../services/marketStateService';
import { saveDrawings } from '../../services/chartDrawingService';
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
    GANN_LEVELS,
    GANN_LEVEL_COLORS,
} from './constants';
import { ChartError, toChartErrorFromString } from './errorUtils';
import { convertKuriDrawings } from './kuriDrawingConverter';
import { normaliseFibSettings, DefaultFibSettings } from './DrawingSettingsModal';
import { KuriBridge, getKuriBridge } from '../../lib/kuri/kuri-bridge';
import ChartHeader from './ChartHeader';
import RightToolbar from './RightToolbar';
import IndicatorEditorPanel from './IndicatorEditorPanel';
import BottomPanel from './BottomPanel';
import { ConsoleLog } from './types';
import ChartNavigation from './ChartNavigation';
import { SidePanels } from './SidePanels';
import FloatingDrawingToolbar from './FloatingDrawingToolbar';
import IndicatorPanel from './IndicatorPickerModal';
import IndicatorSettingsModal from './IndicatorSettingsPanel';
import { DEFAULT_INDICATORS } from '../../indicators';
import ChartSettingsModal from './ChartSettingsModal';
import ActiveIndicatorsDisplay from './ActiveIndicatorsDisplay';
import ContextMenu from './ContextMenu';
import TemplateManagerModal from './TemplateManagerModal';
import { SettingsIcon } from '../IconComponents';
import { AlertMarkers } from './AlertMarkers';
import { MobileDrawingToolsModal, MobileMoreMenu } from './mobile';
import { useResponsive } from '../../hooks/useResponsive';
import {
    renderFibonacci,
    hitTestFibonacci,
    applyFibonacciResize,
    isFibHandle,
    priceAtFibLevel,
    findNearestSwing,
    type DrawingRenderContext,
    type DrawingHitContext,
} from './drawings/fibonacciRetracement';

/** Extract and convert Kuri drawings from engine result */
const extractKuriDrawings = (result: any) => {
    const raw = result.drawings;
    if (!raw) return undefined;
    const converted = convertKuriDrawings(raw);
    if (
        converted.lines.length === 0 &&
        converted.labels.length === 0 &&
        converted.boxes.length === 0
    )
        return undefined;
    return converted;
};

/** Find a registry entry by IndicatorType, searching DEFAULT_INDICATORS directly */
function findRegistryEntry(type: string) {
    const typeLower = type.toLowerCase();
    return DEFAULT_INDICATORS.find(
        (ind) =>
            ind.id === typeLower || ind.shortname === type || ind.shortname === type.toUpperCase()
    );
}

/** Read a plot's color by index, falling back to kuriPlots then a hardcoded default. */
const getPlotColor = (ind: Indicator, plotIndex: number, fallback: string): string => {
    const s = ind.settings as any;
    return s[`plot_${plotIndex}_color`] ?? ind.kuriPlots?.[plotIndex]?.color ?? fallback;
};

/** Read a plot's color by title (e.g. "Upper", "Basis"), falling back to default. */
const getPlotColorByTitle = (ind: Indicator, title: string, fallback: string): string => {
    const plots = ind.kuriPlots || [];
    const idx = plots.findIndex((p) => p.title === title);
    if (idx >= 0) return getPlotColor(ind, idx, fallback);
    return fallback;
};

const getIndicatorDefinition = (type: string) => {
    const found = findRegistryEntry(type);
    return found ? { name: found.name, shortname: found.shortname, overlay: found.overlay } : null;
};

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

// Kuri engine provides all defaults via inputDefs and plots.
// This returns empty settings — populated by Kuri on first run.
const getIndicatorDefaults = (_type: IndicatorType): IndicatorSettings => ({});

/** Migrate legacy setting keys to Kuri title keys for saved indicators.
 *  Maps old keys (period, fastPeriod, etc.) → Kuri titles (Length, Fast Length, etc.)
 *  so user-customized values survive the migration. Runs once on load. */
const LEGACY_TO_TITLE: Record<string, string[]> = {
    period: ['Length', 'RSI Length', 'ATR Period'],
    source: ['Source'],
    stdDev: ['StdDev', 'BB StdDev', 'Multiplier'],
    fastPeriod: ['Fast Length'],
    slowPeriod: ['Slow Length'],
    signalPeriod: ['Signal Smoothing', 'Signal Length'],
    kPeriod: ['%K Length'],
    kSlowing: ['%K Smoothing'],
    dPeriod: ['%D Smoothing'],
    factor: ['Factor'],
    atrPeriod: ['ATR Length'],
};
function migrateSettingsToTitleKeys(
    settings: IndicatorSettings,
    inputDefs?: any[]
): IndicatorSettings {
    if (!inputDefs || inputDefs.length === 0) return settings;
    const s = { ...settings } as any;
    const titleSet = new Set(inputDefs.map((d: any) => d.title));
    for (const [legacyKey, titles] of Object.entries(LEGACY_TO_TITLE)) {
        if (s[legacyKey] !== undefined) {
            for (const title of titles) {
                if (titleSet.has(title) && s[title] === undefined) {
                    s[title] = s[legacyKey];
                }
            }
        }
    }
    return s;
}

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
    priceRange: { min: number; max: number } | null;
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
    initialSettings?: Partial<ChartSettings> | null;
    onSettingsChange?: (settings: ChartSettings) => void;
    initialDrawings?: Drawing[];
    onDrawingsChange?: (drawings: Drawing[]) => void;
    customScripts?: Strategy[];
    autoAddScriptId?: string | null;
    onAutoAddComplete?: () => void;
    onChartError?: (error: ChartError) => void;
    onClearErrors?: (source?: string) => void;
    readOnly?: boolean;
}

function normaliseDrawings(drawings: Drawing[]): Drawing[] {
    return drawings.map((d) => {
        if (d.type === 'Fibonacci Retracement') {
            return {
                ...d,
                style: {
                    ...d.style,
                    fibSettings: normaliseFibSettings(d.style.fibSettings),
                },
            };
        }
        return d;
    });
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
        customScripts = [],
        autoAddScriptId,
        onAutoAddComplete,
        initialDrawings,
        onDrawingsChange,
        onChartError,
        onClearErrors,
        readOnly = false,
    } = props;
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

    const [drawings, setDrawings] = useState<Drawing[]>(normaliseDrawings(initialDrawings || []));

    // Sync changes to parent
    useEffect(() => {
        if (onDrawingsChange) {
            onDrawingsChange(drawings);
        }
    }, [drawings, onDrawingsChange]);

    // Update internal state when initialDrawings prop changes (e.g. symbol switch)
    useEffect(() => {
        if (initialDrawings) {
            setDrawings(normaliseDrawings(initialDrawings));
        }
    }, [initialDrawings]);

    const [currentDrawing, setCurrentDrawing] = useState<CurrentDrawingState>(null);
    const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
    const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
    const [hoveredLevel, setHoveredLevel] = React.useState<number | null>(null);

    const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
    const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

    const [bottomPanelTab, setBottomPanelTab] = useState('Positions');
    const [isBottomPanelOpen, setBottomPanelOpen] = useState(false);

    // Console logging for indicator diagnostics
    interface LocalConsoleLog {
        id: string;
        level: 'info' | 'warn' | 'error';
        source: string;
        message: string;
        details?: string;
        timestamp: Date;
    }
    const [consoleLogs, setConsoleLogs] = useState<LocalConsoleLog[]>([]);
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
    const [toastAlert, setToastAlert] = useState<{
        alert: PriceAlert;
        drawing?: Drawing | null;
        indicatorId?: string;
        indicatorType?: string;
    } | null>(null);
    const [editingAlert, setEditingAlert] = useState<{
        alert: PriceAlert;
        drawing?: Drawing | null;
        indicatorId?: string;
        indicatorType?: string;
    } | null>(null);

    const [isIndicatorEditorOpen, setIsIndicatorEditorOpen] = useState(false);
    const [isIndicatorPanelOpen, setIndicatorPanelOpen] = useState(false);
    const [allActiveIndicators, setAllActiveIndicators] = useState<Indicator[]>([]);
    const [indicatorToEdit, setIndicatorToEdit] = useState<Indicator | null>(null);
    const [indicatorsLoaded, setIndicatorsLoaded] = useState(false); // Track if indicators are loaded from DB

    // Hydrate Kuri data and open settings panel.
    // Runs the .kuri script through the engine to extract inputDefs/plots/hlines
    // so the settings panel auto-generates from the script, not hardcoded fields.
    const openIndicatorSettings = useCallback(
        async (ind: Indicator) => {
            // Already has Kuri data — open directly
            if (ind.kuriInputDefs && ind.kuriInputDefs.length > 0) {
                setIndicatorToEdit(ind);
                return;
            }

            // Find .kuri source: first check the indicator itself, then look up from registry
            let kuriSource = ind.kuriSource || null;
            if (!kuriSource) {
                const registryEntry = findRegistryEntry(ind.type);
                kuriSource = registryEntry?.kuriSource ?? null;
            }

            // Run engine to extract inputDefs, plots, hlines
            if (kuriSource && data.length > 0) {
                try {
                    const bridge = getKuriBridge();
                    const result = await bridge.run(kuriSource, data);
                    // Use Kuri data if inputDefs were produced, even if there were
                    // some runtime errors — inputDefs come from bar-0 parsing
                    const defs = result.inputDefs || [];
                    // Deduplicate plots by title (engine may produce dupes across bars)
                    const seenPlots = new Set<string>();
                    const plots = (result.plots || []).filter((p: any) => {
                        const key = p.title || p.id;
                        if (seenPlots.has(key)) return false;
                        seenPlots.add(key);
                        return true;
                    });
                    if (defs.length > 0 || plots.length > 0) {
                        const hydratedPlots = plots.map((p: any) => ({
                            title: p.title || 'Plot',
                            color: p.color || '#2962FF',
                            colors: p.colors || null,
                            linewidth: p.linewidth || 1,
                            linewidths: p.linewidths || null,
                            style: p.style || 'line',
                            kind: p.kind || 'plot',
                            display: p.display || undefined,
                        }));

                        // Sync Kuri inputDef defaults into settings so chart
                        // calculations and rendering use .kuri values, not hardcoded defaults
                        const syncedSettings = { ...ind.settings };
                        for (const def of defs) {
                            if (def.type === 'source') {
                                (syncedSettings as any)[def.title] =
                                    (syncedSettings as any)[def.title] ?? 'close';
                                continue;
                            }
                            (syncedSettings as any)[def.title] =
                                (syncedSettings as any)[def.title] ?? def.defval;
                            // Also write legacy key
                            const legacyKey = Object.entries(LEGACY_TO_TITLE).find(([, titles]) =>
                                titles.includes(def.title)
                            )?.[0];
                            if (legacyKey) {
                                (syncedSettings as any)[legacyKey] =
                                    (syncedSettings as any)[legacyKey] ??
                                    (syncedSettings as any)[def.title] ??
                                    def.defval;
                            }
                        }
                        // Sync plot colors into settings
                        hydratedPlots.forEach((p: any, i: number) => {
                            (syncedSettings as any)[`plot_${i}_color`] =
                                (syncedSettings as any)[`plot_${i}_color`] ?? p.color;
                            (syncedSettings as any)[`plot_${i}_linewidth`] =
                                (syncedSettings as any)[`plot_${i}_linewidth`] ?? p.linewidth;
                            (syncedSettings as any)[`plot_${i}_visible`] =
                                (syncedSettings as any)[`plot_${i}_visible`] ?? true;
                        });
                        if (hydratedPlots.length > 0 && !syncedSettings.color) {
                            syncedSettings.color = hydratedPlots[0].color;
                        }

                        const hydrated: Indicator = {
                            ...ind,
                            kuriSource,
                            kuriTitle: result.indicator?.title || '',
                            kuriOverlay: result.indicator?.overlay ?? false,
                            kuriInputDefs: defs,
                            kuriPlots: hydratedPlots,
                            kuriHlines: (result.hlines || []).map((h: any) => ({
                                price: h.price,
                                title: h.title || '',
                                color: h.color || '#787B86',
                                editable: h.editable !== false,
                            })),
                            kuriBgcolors: (result as any).bgcolors || [],
                            kuriFills: ((result as any).fills || []).map((f: any) => ({
                                plot1: f.plot1?.title || '',
                                plot2: f.plot2?.title || '',
                                color: f.color || 'rgba(33,150,243,0.1)',
                            })),
                            settings: syncedSettings,
                            data: {},
                            kuriDrawings: extractKuriDrawings(result),
                        };
                        // Use Kuri engine data
                        hydrated.data = bridge.toIndicatorData(result);
                        // Back-fill the main indicator array so Kuri data persists
                        setAllActiveIndicators((prev) =>
                            prev.map((i) =>
                                i.id === hydrated.id
                                    ? {
                                          ...i,
                                          kuriSource: hydrated.kuriSource,
                                          kuriTitle: hydrated.kuriTitle,
                                          kuriInputDefs: hydrated.kuriInputDefs,
                                          kuriPlots: hydrated.kuriPlots,
                                          kuriHlines: hydrated.kuriHlines,
                                          kuriDrawings: hydrated.kuriDrawings,
                                          settings: hydrated.settings,
                                          data: hydrated.data,
                                      }
                                    : i
                            )
                        );
                        setIndicatorToEdit(hydrated);
                        return;
                    }
                } catch (e) {
                    console.warn(`[Settings] Kuri hydration failed for ${ind.type}:`, e);
                }
            }

            // Fallback: open with whatever data we have
            setIndicatorToEdit(ind);
        },
        [data]
    );
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
        if (props.initialSettings) {
            const defaults = getDefaultChartSettings(props.symbol);
            return {
                symbol: { ...defaults.symbol, ...props.initialSettings.symbol },
                statusLine: { ...defaults.statusLine, ...props.initialSettings.statusLine },
                scalesAndLines: { ...defaults.scalesAndLines, ...props.initialSettings.scalesAndLines },
                canvas: { ...defaults.canvas, ...props.initialSettings.canvas },
            };
        }

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

    const handleToggleIndicatorEditor = useCallback(() => {
        setIsIndicatorEditorOpen((prev) => !prev);
    }, []);

    // Ctrl+E to toggle indicator editor
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                handleToggleIndicatorEditor();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleToggleIndicatorEditor]);

    const handleIndicatorSaved = useCallback(async () => {
        try {
            const { getStrategies } = await import('../../services/strategyService');
            const all = await getStrategies();
            console.log('[Chart] Indicator saved, reloaded', all.length, 'scripts');
        } catch (err) {
            console.error('[Chart] Failed to reload indicators:', err);
        }
    }, []);

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

            // Hydrate kuri defaults and calculate data for loaded indicators (async, off main thread)
            const bridge = getKuriBridge();
            const indicatorsWithData = await Promise.all(
                dbIndicators.map(async (ind) => {
                    // Hydrate kuriSource from registry if not saved in DB
                    let hydratedInd = { ...ind };
                    if (!hydratedInd.kuriSource) {
                        const registryEntry = findRegistryEntry(hydratedInd.type);
                        if (registryEntry?.kuriSource) {
                            hydratedInd.kuriSource = registryEntry.kuriSource;
                        }
                    }

                    // Migrate legacy key names → Kuri title keys for DB-saved indicators
                    hydratedInd.settings = migrateSettingsToTitleKeys(
                        hydratedInd.settings,
                        hydratedInd.kuriInputDefs
                    );

                    // Sync kuri inputDef defaults into settings (fill missing keys only)
                    if (hydratedInd.kuriSource && data.length > 0) {
                        try {
                            // Build overrides from existing settings
                            const overrides: Record<string, any> = {};
                            if (hydratedInd.kuriInputDefs && hydratedInd.kuriInputDefs.length > 0) {
                                hydratedInd.kuriInputDefs.forEach((def: any) => {
                                    const engineKey = def.title.toLowerCase().replace(/\s+/g, '_');
                                    const val = (hydratedInd.settings as any)[def.title];
                                    if (val !== undefined) overrides[engineKey] = val;
                                });
                            } else {
                                // No inputDefs yet (first load) — pass settings directly
                                // using lowercased keys so the engine can match them
                                Object.entries(hydratedInd.settings || {}).forEach(([k, v]) => {
                                    if (v !== undefined && v !== null && !k.startsWith('plot_') && !k.startsWith('vis_') && !k.startsWith('hline_') && !k.startsWith('fill_') && !k.startsWith('bgcolor_') && k !== 'color') {
                                        overrides[k.toLowerCase().replace(/\s+/g, '_')] = v;
                                    }
                                });
                            }
                            const result = await bridge.run(
                                hydratedInd.kuriSource,
                                data,
                                overrides
                            );
                            const defs = result.inputDefs || [];
                            const seenPlots = new Set<string>();
                            const plots = (result.plots || []).filter((p: any) => {
                                const key = p.title || p.id;
                                if (seenPlots.has(key)) return false;
                                seenPlots.add(key);
                                return true;
                            });

                            // Sync inputDef defaults → settings (only fill missing keys)
                            const syncedSettings = { ...hydratedInd.settings };
                            for (const def of defs) {
                                if ((syncedSettings as any)[def.title] === undefined) {
                                    (syncedSettings as any)[def.title] =
                                        def.type === 'source' ? 'close' : def.defval;
                                }
                                // Also write legacy key
                                const legacyKey = Object.entries(LEGACY_TO_TITLE).find(
                                    ([, titles]) => titles.includes(def.title)
                                )?.[0];
                                if (legacyKey && (syncedSettings as any)[legacyKey] === undefined) {
                                    (syncedSettings as any)[legacyKey] =
                                        (syncedSettings as any)[def.title] ?? def.defval;
                                }
                            }

                            // Sync plot colors → settings (only fill missing keys)
                            const kuriPlots = plots.map((p: any) => ({
                                title: p.title || 'Plot',
                                color: p.color || '#2962FF',
                                colors: p.colors || null,
                                linewidth: p.linewidth || 1,
                                linewidths: p.linewidths || null,
                                style: p.style || 'line',
                                kind: p.kind || 'plot',
                                location: p.location,
                                size: p.size,
                                text: p.text,
                                texts: p.texts || null,
                                textcolor: p.textcolor,
                            }));
                            kuriPlots.forEach((p: any, i: number) => {
                                if (!(syncedSettings as any)[`plot_${i}_color`]) {
                                    (syncedSettings as any)[`plot_${i}_color`] = p.color;
                                }
                                if ((syncedSettings as any)[`plot_${i}_linewidth`] === undefined) {
                                    (syncedSettings as any)[`plot_${i}_linewidth`] = p.linewidth;
                                }
                                if ((syncedSettings as any)[`plot_${i}_visible`] === undefined) {
                                    (syncedSettings as any)[`plot_${i}_visible`] = true;
                                }
                            });
                            if (kuriPlots.length > 0 && !syncedSettings.color) {
                                syncedSettings.color = kuriPlots[0].color;
                            }
                            // Map plot colors → named renderer keys (fill missing only)
                            hydratedInd.settings = syncedSettings;
                            hydratedInd.kuriInputDefs = hydratedInd.kuriInputDefs || defs;
                            hydratedInd.kuriPlots = hydratedInd.kuriPlots || kuriPlots;
                            hydratedInd.kuriHlines =
                                hydratedInd.kuriHlines ||
                                (result.hlines || []).map((h: any) => ({
                                    price: h.price,
                                    title: h.title || '',
                                    color: h.color || '#787B86',
                                    editable: h.editable !== false,
                                }));
                            // Restore kuriOverlay from engine result (not persisted in DB)
                            hydratedInd.kuriOverlay =
                                result.indicator?.overlay ?? hydratedInd.kuriOverlay;
                            hydratedInd.kuriDrawings = extractKuriDrawings(result);
                            // Use Kuri engine data
                            hydratedInd.data = bridge.toIndicatorData(result);
                        } catch {
                            // Continue with existing settings/data
                        }
                    }
                    // Fallback: derive kuriOverlay from registry if still unset
                    if (hydratedInd.kuriOverlay === undefined) {
                        const registryEntry = findRegistryEntry(hydratedInd.type);
                        if (registryEntry) {
                            hydratedInd.kuriOverlay = registryEntry.overlay;
                        }
                    }
                    return hydratedInd;
                })
            );

            if (cancelled) return;

            setAllActiveIndicators((prev) => {
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

    // Track last candle close for change detection on tick updates
    const lastCloseRef = useRef<number | null>(null);
    const lastClose = data.length > 0 ? data[data.length - 1].close : null;
    const closeChanged = lastClose !== lastCloseRef.current;
    lastCloseRef.current = lastClose;

    // Recalculate indicator data when new candles arrive or price ticks
    useEffect(() => {
        if (!indicatorsLoaded || data.length === 0) return;
        let cancelled = false;
        const bridge = getKuriBridge();

        // Capture current indicators for the async work
        setAllActiveIndicators((prev) => {
            // Kick off async recalculation using a snapshot of prev
            const snapshot = prev;
            (async () => {
                const updated = await Promise.all(
                    snapshot.map(async (ind) => {
                        if (ind.type.startsWith('KURI_')) return ind;
                        // Skip if data length hasn't changed AND close price is unchanged
                        const firstKey = Object.keys(ind.data || {})[0] || 'main';
                        if (ind.data?.[firstKey]?.length === data.length && !closeChanged) return ind;

                        // Recalculate via Kuri engine (off main thread)
                        if (ind.kuriSource) {
                            try {
                                const overrides: Record<string, any> = {};
                                (ind.kuriInputDefs || []).forEach((def: any) => {
                                    const engineKey = def.title.toLowerCase().replace(/\s+/g, '_');
                                    const val = (ind.settings as any)[def.title];
                                    if (val !== undefined) overrides[engineKey] = val;
                                });
                                const result = await bridge.run(ind.kuriSource, data, overrides);
                                const updatedPlots = (result.plots || []).map((p: any) => ({
                                    title: p.title || 'Plot',
                                    color: p.color || '#2962FF',
                                    colors: p.colors || null,
                                    linewidth: p.linewidth || 1,
                                    linewidths: p.linewidths || null,
                                    style: p.style || 'line',
                                    kind: p.kind || 'plot',
                                    location: p.location,
                                    size: p.size,
                                    text: p.text,
                                    texts: p.texts || null,
                                    textcolor: p.textcolor,
                                }));
                                return {
                                    ...ind,
                                    data: bridge.toIndicatorData(result),
                                    kuriPlots: updatedPlots,
                                    kuriDrawings: extractKuriDrawings(result),
                                    kuriBgcolors: (result as any).bgcolors || [],
                                    kuriFills: ((result as any).fills || []).map((f: any) => ({
                                        plot1: f.plot1?.title || '',
                                        plot2: f.plot2?.title || '',
                                        color: f.color || 'rgba(33,150,243,0.1)',
                                    })),
                                };
                            } catch {
                                // Keep existing data on error
                            }
                        }
                        return ind;
                    })
                );
                if (!cancelled) {
                    setAllActiveIndicators(updated);
                }
            })();
            // Return prev synchronously — async update will follow
            return prev;
        });

        return () => {
            cancelled = true;
        };
    }, [data.length, lastClose, indicatorsLoaded]);

    // Debounce indicator saves to database

    // Overlay detection: driven entirely by the kuriOverlay flag set from the
    // indicator() declaration in the .kuri script (overlay=true/false).
    const isOverlayIndicator = useCallback((i: Indicator) => i.kuriOverlay === true, []);

    // Timeframe visibility filter — maps activeTimeframe to visibility group key
    const isVisibleOnTimeframe = useCallback(
        (i: Indicator): boolean => {
            const s = i.settings as any;
            const tf = activeTimeframe;
            // Map timeframe string to visibility group key
            let groupKey: string;
            if (/^\d+S$/i.test(tf)) groupKey = 'seconds';
            else if (/^\d+$/.test(tf) || /^\d+m$/i.test(tf)) groupKey = 'minutes';
            else if (/^\d+h$/i.test(tf)) groupKey = 'hours';
            else if (/^\d+D$/i.test(tf)) groupKey = 'days';
            else if (/^\d+W$/i.test(tf)) groupKey = 'weeks';
            else if (/^\d+M$/i.test(tf)) groupKey = 'months';
            else groupKey = 'minutes'; // fallback
            // Check if vis_<group> is explicitly set to false
            return s[`vis_${groupKey}`] !== false;
        },
        [activeTimeframe]
    );

    const overlayIndicators = useMemo(() => {
        return allActiveIndicators.filter((i) => isOverlayIndicator(i) && isVisibleOnTimeframe(i));
    }, [allActiveIndicators, isOverlayIndicator, isVisibleOnTimeframe]);

    const panelIndicators = useMemo(() => {
        return allActiveIndicators.filter((i) => !isOverlayIndicator(i) && isVisibleOnTimeframe(i));
    }, [allActiveIndicators, isOverlayIndicator, isVisibleOnTimeframe]);

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
                if (ind.type.startsWith('KURI_') && false /* removed kuriScript */) return;
                loggedIndicatorWarnings.current.add(warnKey);
                addConsoleLog(
                    'warn',
                    'Diagnostics',
                    `"${ind.type || ind.type}" has empty data object — no series to plot.`,
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
                    `"${ind.type || ind.type}" has data keys [${dataKeys.join(', ')}] but all values are null — line will not be visible.`,
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
        setPriceRange(newState.priceRange ?? { min: 0, max: 0 });
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
        setPriceRange(previousState.priceRange ?? { min: 0, max: 0 });
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
        setPriceRange(nextState.priceRange ?? { min: 0, max: 0 });
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

        // Run Kuri engine on the .kuri source to extract inputDefs, plots, hlines
        const registryEntry = findRegistryEntry(type);
        if (registryEntry?.kuriSource && data.length > 0) {
            try {
                const bridge = getKuriBridge();
                const result = await bridge.run(registryEntry.kuriSource, data);
                const defs = result.inputDefs || [];
                const plots = result.plots || [];
                if (defs.length > 0 || plots.length > 0) {
                    newIndicator.kuriSource = registryEntry.kuriSource;
                    newIndicator.kuriTitle = result.indicator?.title || '';
                    newIndicator.kuriOverlay = result.indicator?.overlay ?? false;
                    newIndicator.kuriInputDefs = defs;
                    // Deduplicate plots
                    const seenPlots = new Set<string>();
                    newIndicator.kuriPlots = plots
                        .filter((p: any) => {
                            const key = p.title || p.id;
                            if (seenPlots.has(key)) return false;
                            seenPlots.add(key);
                            return true;
                        })
                        .map((p: any) => ({
                            title: p.title || 'Plot',
                            color: p.color || '#2962FF',
                            colors: p.colors || null,
                            linewidth: p.linewidth || 1,
                            linewidths: p.linewidths || null,
                            style: p.style || 'line',
                            kind: p.kind || 'plot',
                            display: p.display || undefined,
                        }));
                    newIndicator.kuriHlines = (result.hlines || []).map((h: any) => ({
                        price: h.price,
                        title: h.title || '',
                        color: h.color || '#787B86',
                        editable: h.editable !== false,
                    }));
                    newIndicator.kuriDrawings = extractKuriDrawings(result);
                    newIndicator.kuriBgcolors = (result as any).bgcolors || [];
                    newIndicator.kuriFills = ((result as any).fills || []).map((f: any) => ({
                        plot1: f.plot1?.title || '',
                        plot2: f.plot2?.title || '',
                        color: f.color || 'rgba(33,150,243,0.1)',
                    }));

                    // Sync Kuri input defaults into settings
                    // Write Kuri input defaults under title keys + legacy keys
                    for (const def of defs) {
                        // Source inputs: defval is the data array, but settings need the
                        // source name string (e.g. "close") for the dropdown and engine override
                        if (def.type === 'source') {
                            (newIndicator.settings as any)[def.title] =
                                (newIndicator.settings as any)[def.title] ?? 'close';
                            continue;
                        }
                        (newIndicator.settings as any)[def.title] = def.defval;
                        // Also write legacy key for compatibility
                        const legacyKey = Object.entries(LEGACY_TO_TITLE).find(([, titles]) =>
                            titles.includes(def.title)
                        )?.[0];
                        if (legacyKey) {
                            (newIndicator.settings as any)[legacyKey] = def.defval;
                        }
                    }

                    // MA Ribbon: construct ribbonPeriods from individual MA length inputs
                    if (type === 'MA Ribbon') {
                        const ribbonLengths: number[] = [];
                        for (const def of defs) {
                            if (def.title.match(/MA #\d+ Length/)) {
                                ribbonLengths.push(def.defval);
                            }
                        }
                        if (ribbonLengths.length > 0) {
                            (newIndicator.settings as any).ribbonPeriods = ribbonLengths.join(',');
                        }
                    }

                    // Write initial plot/hline styles into settings (single source of truth)
                    newIndicator.kuriPlots.forEach((p, i) => {
                        (newIndicator.settings as any)[`plot_${i}_color`] = p.color;
                        (newIndicator.settings as any)[`plot_${i}_linewidth`] = p.linewidth;
                        (newIndicator.settings as any)[`plot_${i}_visible`] = true;
                    });
                    if (newIndicator.kuriPlots.length > 0) {
                        (newIndicator.settings as any).color = newIndicator.kuriPlots[0].color;
                    }

                    if (newIndicator.kuriHlines) {
                        newIndicator.kuriHlines.forEach((h, i) => {
                            (newIndicator.settings as any)[`hline_${i}_color`] = h.color;
                            (newIndicator.settings as any)[`hline_${i}_linestyle`] = 'solid';
                            (newIndicator.settings as any)[`hline_${i}_visible`] = true;
                        });
                    }

                    // Use Kuri engine output for chart data
                    newIndicator.data = bridge.toIndicatorData(result);
                }
            } catch (e) {
                console.error(`[Chart] Kuri engine failed for ${type}:`, e);
            }
        }

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
                `Added "${type}" — ${dataKeys.length} series, ${data.length} candles${newIndicator.kuriInputDefs ? ` (${newIndicator.kuriInputDefs.length} inputs from Kuri)` : ''}`
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

        // Auto-open settings if any input has confirm=true (TradingView behavior)
        const hasConfirmInput = (newIndicator.kuriInputDefs || []).some((def: any) => def.confirm);
        if (hasConfirmInput) {
            setIndicatorToEdit(newIndicator);
        }

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
            const scriptCode =
                script.scriptSource ||
                script.kuriScript ||
                script.content?.code ||
                script.content?.scriptSource;

            if (!scriptCode) {
                console.warn('[Chart] Custom script has no Kuri source:', script.name);
                if (onChartError) {
                    onChartError(
                        toChartErrorFromString(
                            `Custom indicator "${script.name || 'Untitled'}" has no script source code`,
                            'Custom Indicator'
                        )
                    );
                }
                return;
            }

            try {
                const bridge = getKuriBridge();
                const result = await bridge.run(scriptCode, data);

                const compileErrors = result.errors.filter((e: any) => e.phase !== 'runtime');
                if (compileErrors.length > 0) {
                    const errorMsg = compileErrors
                        .map((e: any) => `Line ${e.line || '?'}: ${e.message}`)
                        .join('\n');
                    console.error('[Chart] Kuri compile errors in custom script:', compileErrors);
                    if (onChartError) {
                        onChartError(
                            toChartErrorFromString(
                                `Custom indicator "${script.name || 'Untitled'}" failed to compile:\n${errorMsg}`,
                                'Custom Indicator'
                            )
                        );
                    }
                    return;
                }

                // Determine overlay from result.indicator or from plots
                const isOverlay =
                    result.indicator?.overlay ??
                    (result.plots.length > 0 &&
                        result.plots.every((p: any) => p.overlay !== false));
                const newIndicator: Indicator = {
                    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    type: 'KURI' as IndicatorType,
                    settings: {},
                    data: bridge.toIndicatorData(result),
                    isVisible: true,
                    kuriSource: scriptCode,
                    kuriTitle: result.indicator?.title || script.name || 'Custom Indicator',
                    kuriOverlay: isOverlay,
                    kuriInputDefs: result.inputDefs,
                    kuriPlots: result.plots.map((p: any) => ({
                        title: p.title || 'Plot',
                        color: p.color || '#2962FF',
                        colors: p.colors || null,
                        linewidth: p.linewidth || 1,
                        style: p.style || 'line',
                        kind: p.kind || 'plot',
                        overlay: p.overlay ?? isOverlay,
                    })),
                    kuriHlines: result.hlines,
                    kuriDrawings: extractKuriDrawings(result),
                    kuriBgcolors: (result as any).bgcolors || [],
                    kuriFills: ((result as any).fills || []).map((f: any) => ({
                        plot1: f.plot1?.title || '',
                        plot2: f.plot2?.title || '',
                        color: f.color || 'rgba(33,150,243,0.1)',
                    })),
                };

                feedIndicatorToAlertEngine(newIndicator);
                commitStateAndApplyChanges((prev) => ({
                    ...prev,
                    indicators: [...prev.indicators, newIndicator],
                }));

                indicatorService.saveIndicator(props.symbol, props.activeTimeframe, newIndicator);
            } catch (err: any) {
                console.error('[Chart] Failed to run custom Kuri script:', err);
                if (onChartError) {
                    onChartError(
                        toChartErrorFromString(
                            `Custom indicator "${script.name || 'Untitled'}" error: ${err.message || String(err)}`,
                            'Custom Indicator'
                        )
                    );
                }
            }
        },
        [data, props.symbol, props.activeTimeframe, commitStateAndApplyChanges, indicatorService]
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

    const handleCreateIndicatorAlert = async (indicator: any) => {
        const { getAlertConditions } = await import('../../data/indicatorAlertConditions');
        const conditions = getAlertConditions(indicator.type);
        const firstCond = conditions[0];
        const params: Record<string, any> = {};
        firstCond?.parameters.forEach((p: any) => (params[p.name] = p.default));

        const newAlert = await createAlertWithDefaults(
            symbol,
            undefined,
            indicator.id,
            indicator.type,
            firstCond?.id,
            params,
            undefined,
            activeTimeframe,
        );
        if (newAlert) {
            setAlerts((prev) => [...prev, newAlert]);
            setToastAlert({ alert: newAlert, indicatorId: indicator.id, indicatorType: indicator.type });
        }
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
        if (!id.startsWith('ind')) {
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

    // Debounced DB save ref — prevents excessive writes during live settings updates
    const dbSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const handleUpdateIndicator = async (id: string, newSettings: IndicatorSettings) => {
        // Find the indicator to determine if a Kuri re-run is needed
        const targetInd = allActiveIndicators.find((i) => i.id === id);
        let kuriResult: {
            data: ReturnType<KuriBridge['toIndicatorData']>;
            kuriPlots: any[];
            kuriHlines: any[];
            kuriDrawings?: Indicator['kuriDrawings'];
            kuriBgcolors: any[];
            kuriFills: any[];
        } | null = null;

        // Check if any INPUT values changed (not just style keys like plot_N_color)
        // Style-only changes don't need an engine re-run — they're purely cosmetic
        const isStyleOnlyKey = (k: string) =>
            /^plot_\d+_(color|linewidth|linestyle|plotstyle|visible|barcolor_\d+)$/.test(k) ||
            /^hline_\d+_(color|linestyle|visible)$/.test(k) ||
            /^fill_\d+_(color|visible)$/.test(k) ||
            /^bgcolor_\d+_visible$/.test(k) ||
            /^vis_/.test(k);
        const needsRerun =
            targetInd?.kuriInputDefs?.some((def: any) => {
                const oldVal = (targetInd.settings as any)[def.title];
                const newVal = (newSettings as any)[def.title];
                return oldVal !== newVal;
            }) ?? false;

        // If indicator has Kuri source AND input values changed, re-run engine
        if (needsRerun && targetInd?.kuriSource && data.length > 0) {
            try {
                const bridge = getKuriBridge();
                // Build inputOverrides keyed by the engine's internal key
                // (title lowercased, spaces → underscores), which is what
                // handleInputCall uses to store/retrieve override values.
                const overrides: Record<string, any> = {};
                (targetInd.kuriInputDefs || []).forEach((def: any) => {
                    const engineKey = def.title.toLowerCase().replace(/\s+/g, '_');
                    const settingKey = def.title;
                    const val = newSettings[settingKey as keyof IndicatorSettings];
                    if (val !== undefined) {
                        overrides[engineKey] = val;
                    }
                });
                const result = await bridge.run(targetInd.kuriSource, data, overrides);
                const defs = result.inputDefs || [];
                const plots = result.plots || [];
                if (defs.length > 0 || plots.length > 0) {
                    // Update plot/hline metadata and data from Kuri
                    const seenPlots = new Set<string>();
                    kuriResult = {
                        data: bridge.toIndicatorData(result),
                        kuriPlots: plots
                            .filter((p: any) => {
                                const key = p.title || p.id;
                                if (seenPlots.has(key)) return false;
                                seenPlots.add(key);
                                return true;
                            })
                            .map((p: any) => ({
                                title: p.title || 'Plot',
                                color: p.color || '#2962FF',
                                colors: p.colors || null,
                                linewidth: p.linewidth || 1,
                                linewidths: p.linewidths || null,
                                style: p.style || 'line',
                                kind: p.kind || 'plot',
                            })),
                        kuriHlines: (result.hlines || []).map((h: any) => ({
                            price: h.price,
                            title: h.title || '',
                            color: h.color || '#787B86',
                            editable: h.editable !== false,
                        })),
                        kuriDrawings: extractKuriDrawings(result),
                        kuriBgcolors: (result as any).bgcolors || [],
                        kuriFills: ((result as any).fills || []).map((f: any) => ({
                            plot1: f.plot1?.title || '',
                            plot2: f.plot2?.title || '',
                            color: f.color || 'rgba(33,150,243,0.1)',
                        })),
                    };
                }
            } catch (e) {
                console.warn(`[Chart] Kuri re-run failed:`, e);
            }
        }

        // Apply the update (now synchronous since Kuri work is done)
        commitStateAndApplyChanges((prev) => {
            const indicators = prev.indicators.map((i) => {
                if (i.id === id) {
                    const updated = { ...i, settings: newSettings };
                    if (kuriResult) {
                        updated.data = kuriResult.data;
                        updated.kuriPlots = kuriResult.kuriPlots;
                        updated.kuriHlines = kuriResult.kuriHlines;
                        updated.kuriDrawings = kuriResult.kuriDrawings;
                        updated.kuriBgcolors = kuriResult.kuriBgcolors;
                        updated.kuriFills = kuriResult.kuriFills;
                    }
                    return updated;
                }
                return i;
            });
            return { ...prev, indicators };
        });

        // Debounced DB save — coalesce rapid live updates into a single write
        if (!id.startsWith('ind')) {
            clearTimeout(dbSaveTimerRef.current);
            dbSaveTimerRef.current = setTimeout(() => {
                indicatorService.updateIndicator(id, { settings: newSettings });
            }, 800);
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
    const handleLoadTemplate = async (name: string) => {
        const templates = getChartTemplates();
        if (templates[name]) {
            const { drawings: loadedDrawings, indicators: loadedIndicators } = templates[name];
            const bridge = getKuriBridge();
            const indicatorsWithData = await Promise.all(
                (loadedIndicators as any[]).map(async (ind: Indicator) => {
                    if (ind.kuriSource && data.length > 0) {
                        try {
                            const overrides: Record<string, any> = {};
                            (ind.kuriInputDefs || []).forEach((def: any) => {
                                const engineKey = def.title.toLowerCase().replace(/\s+/g, '_');
                                const val = (ind.settings as any)[def.title];
                                if (val !== undefined) overrides[engineKey] = val;
                            });
                            const result = await bridge.run(ind.kuriSource, data, overrides);
                            const updatedPlots = (result.plots || []).map((p: any) => ({
                                title: p.title || 'Plot',
                                color: p.color || '#2962FF',
                                colors: p.colors || null,
                                linewidth: p.linewidth || 1,
                                linewidths: p.linewidths || null,
                                style: p.style || 'line',
                                kind: p.kind || 'plot',
                            }));
                            return {
                                ...ind,
                                data: bridge.toIndicatorData(result),
                                kuriPlots: updatedPlots,
                                kuriDrawings: extractKuriDrawings(result),
                                kuriBgcolors: (result as any).bgcolors || [],
                                kuriFills: ((result as any).fills || []).map((f: any) => ({
                                    plot1: f.plot1?.title || '',
                                    plot2: f.plot2?.title || '',
                                    color: f.color || 'rgba(33,150,243,0.1)',
                                })),
                            };
                        } catch {
                            // Keep existing data on error
                        }
                    }
                    return ind;
                })
            );
            commitStateAndApplyChanges((prev) => ({
                ...prev,
                drawings: normaliseDrawings(loadedDrawings),
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
            // KURI type = custom script, never use bounded scaling
            const isBounded =
                indicator.type !== 'KURI' &&
                ['RSI', 'Stochastic', 'Stoch', 'MFI', 'CCI', 'ADX'].includes(indicator.type);

            // Auto-scale based on VISIBLE data — check ALL data series
            const allDataKeys = Object.keys(indicator.data);
            visibleData.forEach((_, i) => {
                const dataIndex = firstIndexToRender + i;
                for (const key of allDataKeys) {
                    const val = indicator.data[key]?.[dataIndex];
                    if (typeof val === 'number' && !isNaN(val)) {
                        min = Math.min(min, val);
                        max = Math.max(max, val);
                    }
                }
            });

            if (isBounded) {
                if (
                    indicator.type === 'Stochastic' ||
                    (indicator.type as string) === 'Stoch' ||
                    indicator.type === 'RSI' ||
                    indicator.type === 'MFI'
                ) {
                    // Fixed 0-100 range — values are always within this range
                    min = 0;
                    max = 100;
                } else if (indicator.type === 'CCI') {
                    min = Math.min(min === Infinity ? -100 : min, -100);
                    max = Math.max(max === -Infinity ? 100 : max, 100);
                } else if ((indicator.type as string) === 'ADX') {
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

            const drawLine = (
                dataArr: (number | null)[],
                color: string,
                perBarColors?: (string | null)[] | null,
                perBarWidths?: (number | null)[] | null
            ) => {
                if (perBarColors || perBarWidths) {
                    // Per-segment rendering (color and/or linewidth vary)
                    let prevX: number | null = null;
                    let prevY: number | null = null;
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        const val = dataArr[dataIndex];
                        if (val === null || val === undefined || isNaN(val as number)) {
                            prevX = null;
                            prevY = null;
                            continue;
                        }
                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val);
                        if (prevX !== null && prevY !== null) {
                            ctx.beginPath();
                            ctx.strokeStyle = perBarColors?.[dataIndex] ?? color;
                            ctx.lineWidth = perBarWidths?.[dataIndex] ?? ctx.lineWidth;
                            ctx.moveTo(prevX, prevY);
                            ctx.lineTo(x, y);
                            ctx.stroke();
                        }
                        prevX = x;
                        prevY = y;
                    }
                } else {
                    // Single color — batch into one path for performance
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
                }
            };

            // Dynamic Kuri-driven rendering — use plot styles from .kuri script

            // Draw bgcolor() bands (per-bar background colors)
            if (indicator.kuriBgcolors && indicator.kuriBgcolors.length > 0) {
                indicator.kuriBgcolors.forEach((bg: any, bgIdx: number) => {
                    if (!bg.data) return;
                    if ((indicator.settings as any)?.[`bgcolor_${bgIdx}_visible`] === false) return;
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        if (dataIndex < 0 || dataIndex >= bg.data.length) continue;
                        const c = bg.data[dataIndex];
                        if (!c) continue;
                        const x = indexToX(dataIndex - view.startIndex) - xStep / 2;
                        ctx.fillStyle = c;
                        ctx.globalAlpha = 0.25;
                        ctx.fillRect(x, 0, xStep, height);
                    }
                    ctx.globalAlpha = 1;
                });
            }

            // Draw fill() regions between two plot series
            if (indicator.kuriFills && indicator.kuriFills.length > 0) {
                (indicator.kuriFills as any[]).forEach((fill: any, fillIdx: number) => {
                    if ((indicator.settings as any)?.[`fill_${fillIdx}_visible`] === false) return;
                    const fillColor =
                        (indicator.settings as any)?.[`fill_${fillIdx}_color`] ?? fill.color;
                    const s1 = indicator.data[fill.plot1];
                    const s2 = indicator.data[fill.plot2];
                    if (!s1 || !s2) return;
                    ctx.fillStyle = fillColor;
                    ctx.globalAlpha = 0.2;
                    ctx.beginPath();
                    const pts1: [number, number][] = [];
                    const pts2: [number, number][] = [];
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        const v1 = s1[dataIndex];
                        const v2 = s2[dataIndex];
                        if (v1 == null || v2 == null || isNaN(v1 as number) || isNaN(v2 as number))
                            continue;
                        const x = indexToX(dataIndex - view.startIndex);
                        pts1.push([x, getPanelY(v1 as number)]);
                        pts2.push([x, getPanelY(v2 as number)]);
                    }
                    if (pts1.length > 1) {
                        ctx.moveTo(pts1[0][0], pts1[0][1]);
                        for (let j = 1; j < pts1.length; j++) ctx.lineTo(pts1[j][0], pts1[j][1]);
                        for (let j = pts2.length - 1; j >= 0; j--)
                            ctx.lineTo(pts2[j][0], pts2[j][1]);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                });
            }

            // Draw hlines from .kuri if available
            if (indicator.kuriHlines && indicator.kuriHlines.length > 0) {
                indicator.kuriHlines.forEach((h: any, hi: number) => {
                    const hVisible = (indicator.settings as any)?.[`hline_${hi}_visible`];
                    if (hVisible === false) return;
                    const hColor =
                        (indicator.settings as any)?.[`hline_${hi}_color`] || h.color || '#787B86';
                    const y = getPanelY(h.price);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = hColor;
                    ctx.globalAlpha = 0.7;
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                });
            } else if (isBounded) {
                const levels = indicator.type === 'RSI' ? [30, 70] : [20, 80];
                levels.forEach((level) => {
                    const y = getPanelY(level);
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = '#E0E0E0';
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                });
            }

            // Render each plot according to its style
            const plots = indicator.kuriPlots || [
                {
                    title: 'main',
                    style: 'line',
                    color: indicator.settings.color || '#2962FF',
                    linewidth: 1,
                },
            ];
            plots.forEach((plot: any, plotIdx: number) => {
                const plotVisible = (indicator.settings as any)?.[`plot_${plotIdx}_visible`];
                if (plotVisible === false) return;
                const plotColor = getPlotColor(indicator, plotIdx, plot.color || '#2962FF');
                const plotWidth =
                    (indicator.settings as any)?.[`plot_${plotIdx}_linewidth`] ||
                    plot.linewidth ||
                    1;
                // Find the data series for this plot
                const seriesData =
                    indicator.data[plot.title] ||
                    (plotIdx === 0 ? indicator.data.main || indicator.data.value : null);
                if (!seriesData) return;

                const style =
                    (indicator.settings as any)?.[`plot_${plotIdx}_plotstyle`] ||
                    plot.style ||
                    'line';
                const plotKind = plot.kind || 'plot';
                let perBarColors = plot.colors as (string | null)[] | null;

                // Apply per-bar color overrides from settings (e.g. MACD histogram 4-color scheme)
                if (perBarColors) {
                    const s = indicator.settings as any;
                    // Build remap: extract unique original colors, check for overrides
                    const uniqueOrig: string[] = [];
                    const seen = new Set<string>();
                    for (const c of perBarColors) {
                        if (c && !seen.has(c)) {
                            seen.add(c);
                            uniqueOrig.push(c);
                        }
                    }
                    let hasOverride = false;
                    const colorMap = new Map<string, string>();
                    uniqueOrig.forEach((orig, ci) => {
                        const ov = s[`plot_${plotIdx}_barcolor_${ci}`];
                        if (ov && ov !== orig) {
                            colorMap.set(orig, ov);
                            hasOverride = true;
                        }
                    });
                    if (hasOverride) {
                        perBarColors = perBarColors.map((c) => (c ? (colorMap.get(c) ?? c) : c));
                    }
                }

                if (
                    style === 'columns' ||
                    style === 'histogram' ||
                    style === 'plot.style_columns'
                ) {
                    // Column/bar rendering (Volume, MACD histogram)
                    const barWidth = xStep * 0.7;
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        if (dataIndex < 0 || dataIndex >= data.length) continue;
                        const val = seriesData[dataIndex];
                        if (val === null || val === undefined || isNaN(val as number)) continue;
                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val as number);
                        const zeroY = getPanelY(0);
                        ctx.fillStyle = perBarColors?.[dataIndex] ?? plotColor;
                        ctx.globalAlpha = 0.7;
                        ctx.fillRect(
                            x - barWidth / 2,
                            Math.min(y, zeroY),
                            barWidth,
                            Math.max(0.5, Math.abs(y - zeroY))
                        );
                    }
                    ctx.globalAlpha = 1;
                } else if (style === 'circles') {
                    // Scatter/circle rendering
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        if (dataIndex < 0 || dataIndex >= data.length) continue;
                        const val = seriesData[dataIndex];
                        if (val === null || val === undefined || isNaN(val as number)) continue;
                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val as number);
                        ctx.fillStyle = perBarColors?.[dataIndex] ?? plotColor;
                        ctx.beginPath();
                        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (style === 'cross' || style === 'xcross') {
                    // Cross / X marker rendering
                    const sz = 4;
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        if (dataIndex < 0 || dataIndex >= data.length) continue;
                        const val = seriesData[dataIndex];
                        if (val === null || val === undefined || isNaN(val as number)) continue;
                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val as number);
                        ctx.strokeStyle = perBarColors?.[dataIndex] ?? plotColor;
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        if (style === 'xcross') {
                            ctx.moveTo(x - sz, y - sz);
                            ctx.lineTo(x + sz, y + sz);
                            ctx.moveTo(x + sz, y - sz);
                            ctx.lineTo(x - sz, y + sz);
                        } else {
                            ctx.moveTo(x - sz, y);
                            ctx.lineTo(x + sz, y);
                            ctx.moveTo(x, y - sz);
                            ctx.lineTo(x, y + sz);
                        }
                        ctx.stroke();
                    }
                } else if (style === 'area' || style === 'areabr') {
                    // Area: line with filled region to baseline
                    ctx.lineWidth = plotWidth;
                    const areaWidths = plot.linewidths as (number | null)[] | null;
                    drawLine(seriesData as (number | null)[], plotColor, perBarColors, areaWidths);
                    // Fill below line to zero/bottom
                    const zeroY = getPanelY(0);
                    ctx.fillStyle = plotColor;
                    ctx.globalAlpha = 0.15;
                    ctx.beginPath();
                    let started = false;
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        const val = seriesData[dataIndex];
                        if (val === null || val === undefined || isNaN(val as number)) {
                            if (started) {
                                ctx.lineTo(indexToX(dataIndex - 1 - view.startIndex), zeroY);
                                ctx.closePath();
                                ctx.fill();
                                ctx.beginPath();
                                started = false;
                            }
                            continue;
                        }
                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val);
                        if (!started) {
                            ctx.moveTo(x, zeroY);
                            ctx.lineTo(x, y);
                            started = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                    if (started) {
                        // Close to baseline
                        const lastVisIdx = Math.min(
                            Math.floor(view.startIndex) + view.visibleCandles - 1,
                            data.length - 1
                        );
                        ctx.lineTo(indexToX(lastVisIdx - view.startIndex), zeroY);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                } else if (style === 'stepline') {
                    // Step line: horizontal then vertical
                    ctx.lineWidth = plotWidth;
                    ctx.strokeStyle = plotColor;
                    ctx.beginPath();
                    let prevX: number | null = null;
                    let prevY: number | null = null;
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        const val = seriesData[dataIndex];
                        if (val === null || val === undefined || isNaN(val as number)) {
                            if (prevX !== null) {
                                ctx.stroke();
                                ctx.beginPath();
                            }
                            prevX = null;
                            prevY = null;
                            continue;
                        }
                        const x = indexToX(dataIndex - view.startIndex);
                        const y = getPanelY(val);
                        if (prevX !== null && prevY !== null) {
                            if (perBarColors) {
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.strokeStyle = perBarColors[dataIndex] ?? plotColor;
                                ctx.moveTo(prevX, prevY);
                            }
                            ctx.lineTo(x, prevY); // horizontal
                            ctx.lineTo(x, y); // vertical
                        } else {
                            ctx.moveTo(x, y);
                        }
                        prevX = x;
                        prevY = y;
                    }
                    ctx.stroke();
                } else if (
                    plotKind === 'plotshape' ||
                    plotKind === 'plotchar' ||
                    plotKind === 'plotarrow'
                ) {
                    // Shape/arrow/char markers
                    const shapeStyle = style || 'circle';
                    const sz = 5;
                    const shapeLocation = (plot as any).location || 'abovebar';
                    const shapeText = (plot as any).text || '';
                    const shapeTexts = (plot as any).texts as (string | null)[] | null;
                    const shapeTextColor = (plot as any).textcolor || plotColor;
                    const locationOffset = 12; // pixels offset from bar
                    for (let i = 0; i < view.visibleCandles; i++) {
                        const dataIndex = Math.floor(view.startIndex) + i;
                        if (dataIndex < 0 || dataIndex >= data.length) continue;
                        const val = seriesData[dataIndex] as any;
                        // Skip false, null, undefined, NaN — plotshape condition is boolean
                        if (!val || val === null || (typeof val === 'number' && isNaN(val)))
                            continue;
                        const x = indexToX(dataIndex - view.startIndex);
                        // Position based on location: use candle high/low, not the boolean value
                        let y: number;
                        const candle = data[dataIndex];
                        if (shapeLocation === 'belowbar' && candle) {
                            y = getPanelY(candle.low) + locationOffset;
                        } else if (shapeLocation === 'abovebar' && candle) {
                            y = getPanelY(candle.high) - locationOffset;
                        } else if (typeof val === 'number' && !isNaN(val) && val !== 1) {
                            // location.absolute: use the value itself as y
                            y = getPanelY(val);
                        } else if (candle) {
                            y = getPanelY(candle.high) - locationOffset;
                        } else {
                            continue;
                        }
                        const c = perBarColors?.[dataIndex] ?? plotColor;
                        ctx.fillStyle = c;
                        ctx.strokeStyle = c;
                        ctx.lineWidth = 1.5;
                        if (shapeStyle === 'triangleup' || shapeStyle === 'arrowup') {
                            ctx.beginPath();
                            ctx.moveTo(x, y - sz);
                            ctx.lineTo(x - sz, y + sz);
                            ctx.lineTo(x + sz, y + sz);
                            ctx.closePath();
                            ctx.fill();
                        } else if (shapeStyle === 'triangledown' || shapeStyle === 'arrowdown') {
                            ctx.beginPath();
                            ctx.moveTo(x, y + sz);
                            ctx.lineTo(x - sz, y - sz);
                            ctx.lineTo(x + sz, y - sz);
                            ctx.closePath();
                            ctx.fill();
                        } else if (shapeStyle === 'diamond' || shapeStyle === 'square') {
                            if (shapeStyle === 'diamond') {
                                ctx.beginPath();
                                ctx.moveTo(x, y - sz);
                                ctx.lineTo(x + sz, y);
                                ctx.lineTo(x, y + sz);
                                ctx.lineTo(x - sz, y);
                                ctx.closePath();
                                ctx.fill();
                            } else {
                                ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
                            }
                        } else if (shapeStyle === 'cross' || shapeStyle === 'xcross') {
                            ctx.beginPath();
                            if (shapeStyle === 'xcross') {
                                ctx.moveTo(x - sz, y - sz);
                                ctx.lineTo(x + sz, y + sz);
                                ctx.moveTo(x + sz, y - sz);
                                ctx.lineTo(x - sz, y + sz);
                            } else {
                                ctx.moveTo(x - sz, y);
                                ctx.lineTo(x + sz, y);
                                ctx.moveTo(x, y - sz);
                                ctx.lineTo(x, y + sz);
                            }
                            ctx.stroke();
                        } else if (
                            shapeStyle === 'flag' ||
                            shapeStyle === 'labelup' ||
                            shapeStyle === 'labeldown'
                        ) {
                            // Flag/label: small rectangle with stem
                            ctx.fillRect(x - 3, y - sz, 6, sz * 2);
                            ctx.fillStyle = '#fff';
                            ctx.font = '8px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillText(shapeStyle === 'flag' ? '\u25B2' : '\u25CF', x, y + 3);
                            ctx.fillStyle = c;
                        } else {
                            // Default: circle
                            ctx.beginPath();
                            ctx.arc(x, y, sz, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // Render text label (e.g., "FR↑", "FB↓")
                        const barText = shapeTexts?.[dataIndex] || shapeText;
                        if (barText) {
                            ctx.fillStyle = shapeTextColor;
                            ctx.font = 'bold 9px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline =
                                shapeLocation === 'belowbar' ? 'top' : 'bottom';
                            const textY =
                                shapeLocation === 'belowbar' ? y + sz + 2 : y - sz - 2;
                            ctx.fillText(barText, x, textY);
                        }
                    }
                } else {
                    // Default: line rendering
                    ctx.lineWidth = plotWidth;
                    const lineWidths = plot.linewidths as (number | null)[] | null;
                    drawLine(seriesData as (number | null)[], plotColor, perBarColors, lineWidths);
                }
            });

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
                // Try common keys first, then fall back to first available series
                if (indicator.data.main) valToShow = indicator.data.main[safeIndex];
                else if (indicator.data.macd) valToShow = indicator.data.macd[safeIndex];
                else if (indicator.data.k) valToShow = indicator.data.k[safeIndex];
                else {
                    const firstKey = Object.keys(indicator.data)[0];
                    if (firstKey) valToShow = indicator.data[firstKey][safeIndex];
                }

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
                const hitCtx: DrawingHitContext = { timeToX, yScale, selectedDrawingId };
                const hit = hitTestFibonacci(d, p, hitCtx);
                if (hit) return hit;
                continue;
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

                        // Edge midpoint handles — Gann Box only
                        if (d.type === 'Gann Box') {
                            const mx = (start.x + end.x) / 2;
                            const my = (start.y + end.y) / 2;
                            const topY = Math.min(start.y, end.y);
                            const botY = Math.max(start.y, end.y);
                            const leftX = Math.min(start.x, end.x);
                            const rightX = Math.max(start.x, end.x);
                            if (distSq(p, { x: mx, y: topY }) < hRadiusSq) return { drawing: d, handle: 'top' };
                            if (distSq(p, { x: mx, y: botY }) < hRadiusSq) return { drawing: d, handle: 'bottom' };
                            if (distSq(p, { x: leftX, y: my }) < hRadiusSq) return { drawing: d, handle: 'left' };
                            if (distSq(p, { x: rightX, y: my }) < hRadiusSq) return { drawing: d, handle: 'right' };
                        }

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

    const handleAddAlertAtPrice = async (price: number) => {
        const newAlert = await createAlertWithDefaults(
            symbol,
            undefined, // no drawing
            undefined, // no indicator
            undefined,
            undefined,
            undefined,
            price,     // raw price
            activeTimeframe,
        );
        if (newAlert) {
            setAlerts((prev) => [...prev, newAlert]);
            setToastAlert({ alert: newAlert });
        }
    };

    const handleCreateDrawingAlert = async (drawing: Drawing) => {
        const existing = alerts.find((a) => a.drawingId === drawing.id);
        if (existing) {
            setEditingAlert({ alert: existing, drawing });
            return;
        }
        const newAlert = await createAlertWithDefaults(symbol, drawing, undefined, undefined, undefined, undefined, undefined, activeTimeframe);
        if (newAlert) {
            setAlerts((prev) => [...prev, newAlert]);
            setToastAlert({ alert: newAlert, drawing });
        }
    };

    const handleSaveAlert = async (updated: PriceAlert) => {
        const result = await updateAlert(updated.id, updated);
        if (result) {
            setAlerts((prev) => prev.map((a) => (a.id === result.id ? result : a)));
        }
        setEditingAlert(null);
    };

    const handleDeleteAlert = async (id: string) => {
        await deleteAlert(id);
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        setEditingAlert(null);
    };

    const handleEditAlert = (alert: PriceAlert) => {
        const drawing = alert.drawingId
            ? drawings.find((d) => d.id === alert.drawingId) || null
            : null;

        let indicatorType: string | undefined;
        if (alert.indicatorId) {
            const ind = allActiveIndicators.find((i: any) => i.id === alert.indicatorId);
            indicatorType = ind?.type;
        }

        setToastAlert(null);
        setEditingAlert({
            alert,
            drawing,
            indicatorId: alert.indicatorId,
            indicatorType,
        });
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
                        style:
                            activeTool === 'Fibonacci Retracement'
                                ? { ...defaultStyle, fibSettings: DefaultFibSettings }
                                : defaultStyle,
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
                    let resized = { ...interaction.initialDrawing } as any;
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
                    } else if (resized.type === 'Fibonacci Retracement' && isFibHandle(h)) {
                        resized = applyFibonacciResize(
                            resized,
                            h,
                            snappedPoint,
                            interaction.initialDrawing as typeof resized
                        );
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
                    } else if (h === 'top' && resized.type === 'Gann Box') {
                        // Move the high-price edge; ties go to `start` (strict < picks end)
                        const init = interaction.initialDrawing as any;
                        if (init.start.price >= init.end.price) {
                            resized.start = { ...resized.start, price: snappedPoint.price };
                        } else {
                            resized.end = { ...resized.end, price: snappedPoint.price };
                        }
                    } else if (h === 'bottom' && resized.type === 'Gann Box') {
                        // Move the low-price edge; strict < so `start` wins tie via the 'top' branch
                        const init = interaction.initialDrawing as any;
                        if (init.start.price < init.end.price) {
                            resized.start = { ...resized.start, price: snappedPoint.price };
                        } else {
                            resized.end = { ...resized.end, price: snappedPoint.price };
                        }
                    } else if (h === 'left' && resized.type === 'Gann Box') {
                        // Move the earliest-time edge; ties go to `start`
                        const init = interaction.initialDrawing as any;
                        if (init.start.time <= init.end.time) {
                            resized.start = { ...resized.start, time: snappedPoint.time };
                        } else {
                            resized.end = { ...resized.end, time: snappedPoint.time };
                        }
                    } else if (h === 'right' && resized.type === 'Gann Box') {
                        // Move the latest-time edge; strict > so `start` wins tie via the 'left' branch
                        const init = interaction.initialDrawing as any;
                        if (init.start.time > init.end.time) {
                            resized.start = { ...resized.start, time: snappedPoint.time };
                        } else {
                            resized.end = { ...resized.end, time: snappedPoint.time };
                        }
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

        // Update hoveredLevel for Fibonacci drawings (Task 7)
        {
            const p = { x: svgX, y: svgY };
            let hovered: number | null = null;
            for (const drawing of drawings) {
                if (drawing.type !== 'Fibonacci Retracement' || !drawing.start || !drawing.end) continue;
                const settings = drawing.style.fibSettings;
                if (!settings) continue;
                const xS = timeToX(drawing.start.time);
                const xE = timeToX(drawing.end.time);
                const xMin = Math.min(xS, xE);
                const xMax = Math.max(xS, xE);
                const extendFrom = settings.extendLines === 'both' ? -Infinity : xMin;
                const extendTo =
                    settings.extendLines === 'none' ? xMax : Infinity;
                if (p.x < extendFrom || p.x > extendTo) continue;
                for (const lv of settings.levels) {
                    if (!lv.visible) continue;
                    const price = priceAtFibLevel(
                        drawing.start.price,
                        drawing.end.price,
                        lv.level,
                        settings.useLogScale
                    );
                    const ly = yScale(price);
                    if (Math.abs(p.y - ly) < HITBOX_WIDTH) {
                        hovered = lv.level;
                        break;
                    }
                }
                if (hovered !== null) break;
            }
            if (hovered !== hoveredLevel) setHoveredLevel(hovered);
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

                    // Apply snap-to-swing for Fibonacci Retracement when enabled in settings
                    if (
                        drawing.type === 'Fibonacci Retracement' &&
                        drawing.style.fibSettings?.snapToSwing &&
                        drawing.start &&
                        drawing.end
                    ) {
                        const snappedStart = findNearestSwing(data, drawing.start.time, 20);
                        const snappedEnd = findNearestSwing(data, drawing.end.time, 20);
                        if (snappedStart) drawing.start = snappedStart;
                        if (snappedEnd) drawing.end = snappedEnd;
                    }

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
                            const renderCtx: DrawingRenderContext = {
                                timeToX,
                                yScale,
                                isSelected,
                                chartDimensions,
                                renderHandle,
                                formatPrice,
                                hoveredLevel,
                                style,
                            };
                            return renderFibonacci(d, renderCtx, key);
                        }
                        case 'Gann Box': {
                            if (!d.start || !d.end) return null;
                            const x1 = Math.round(timeToX(d.start.time));
                            const y1 = Math.round(yScale(d.start.price));
                            const x2 = Math.round(timeToX(d.end.time));
                            const y2 = Math.round(yScale(d.end.price));

                            const bx = Math.min(x1, x2);
                            const by = Math.min(y1, y2);
                            const bw = Math.abs(x1 - x2);
                            const bh = Math.abs(y1 - y2);

                            const settings = d.style.gannSettings || {
                                priceLevels: GANN_LEVELS.map((l, i) => ({
                                    level: l,
                                    color: GANN_LEVEL_COLORS[i] || style.color,
                                    visible: true,
                                })),
                                timeLevels: GANN_LEVELS.map((l, i) => ({
                                    level: l,
                                    color: GANN_LEVEL_COLORS[i] || style.color,
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

                            // NaN-guarded transparency
                            const rawTransparency = Number.isFinite(settings.backgroundTransparency)
                                ? settings.backgroundTransparency
                                : 0;
                            const bgOpacity = 1 - Math.max(0, Math.min(1, rawTransparency));

                            // Price helpers — top of box = max price, bottom = min price
                            const topPrice = Math.max(d.start.price, d.end.price);
                            const botPrice = Math.min(d.start.price, d.end.price);
                            const priceAtLevel = (level: number) => topPrice - (topPrice - botPrice) * level;

                            // Time helpers
                            const leftTime = Math.min(d.start.time, d.end.time);
                            const rightTime = Math.max(d.start.time, d.end.time);
                            const timeAtLevel = (level: number) => leftTime + (rightTime - leftTime) * level;
                            const formatGannDate = (unixSecs: number) => {
                                const dt = new Date(unixSecs * 1000);
                                const month = dt.toLocaleString('en-US', { month: 'short' });
                                const day = String(dt.getDate()).padStart(2, '0');
                                const hh = String(dt.getHours()).padStart(2, '0');
                                const mm = String(dt.getMinutes()).padStart(2, '0');
                                return `${month} ${day} ${hh}:${mm}`;
                            };

                            // 8 handle positions
                            const midX = (x1 + x2) / 2;
                            const midY = (y1 + y2) / 2;
                            const topY = by;
                            const botY = by + bh;
                            const leftX = bx;
                            const rightX = bx + bw;

                            // Label collision avoidance — skip labels that would overlap the previous one
                            const TIME_BOTTOM_LABEL_MIN_SPACING = 75; // px for "MMM DD HH:mm"
                            const TIME_TOP_LABEL_MIN_SPACING = 28;    // px for "0.500"
                            const PRICE_LABEL_MIN_SPACING = 12;        // px for 10px-tall labels
                            const LABEL_PAD = 4;
                            let lastTopX = -Infinity;
                            let lastBottomX = -Infinity;
                            const timeTopVisible = activeTimeLevels.map((l) => {
                                if (l.level < 0 || l.level > 1) return false;
                                const lx = bx + bw * l.level;
                                const ok = lx - lastTopX >= TIME_TOP_LABEL_MIN_SPACING;
                                if (ok) lastTopX = lx;
                                return ok;
                            });
                            const timeBottomVisible = activeTimeLevels.map((l) => {
                                if (l.level < 0 || l.level > 1) return false;
                                const lx = bx + bw * l.level;
                                const ok = lx - lastBottomX >= TIME_BOTTOM_LABEL_MIN_SPACING;
                                if (ok) lastBottomX = lx;
                                return ok;
                            });
                            let lastLeftY = -Infinity;
                            let lastRightY = -Infinity;
                            const priceLeftVisible = activePriceLevels.map((l) => {
                                if (l.level < 0 || l.level > 1) return false;
                                const ly = by + bh * l.level;
                                const ok = ly - lastLeftY >= PRICE_LABEL_MIN_SPACING;
                                if (ok) lastLeftY = ly;
                                return ok;
                            });
                            const priceRightVisible = activePriceLevels.map((l) => {
                                if (l.level < 0 || l.level > 1) return false;
                                const ly = by + bh * l.level;
                                const ok = ly - lastRightY >= PRICE_LABEL_MIN_SPACING;
                                if (ok) lastRightY = ly;
                                return ok;
                            });

                            return (
                                <g
                                    key={key}
                                    filter={isSelected ? 'url(#selectionGlow)' : 'none'}
                                    pointerEvents="auto"
                                >
                                    {/* Background fills (pixel-aligned) */}
                                    {settings.showBackground && (
                                        <>
                                            {activeTimeLevels.slice(0, -1).map((l, i) => {
                                                const next = activeTimeLevels[i + 1];
                                                const vxStart = Math.round(bx + bw * l.level);
                                                const vxEnd = Math.round(bx + bw * next.level);
                                                const vw = vxEnd - vxStart;
                                                if (vw <= 0) return null;
                                                return (
                                                    <rect
                                                        key={`t-fill-${i}`}
                                                        x={vxStart}
                                                        y={by}
                                                        width={vw}
                                                        height={bh}
                                                        fill={l.color}
                                                        fillOpacity={bgOpacity * 0.5}
                                                    />
                                                );
                                            })}
                                            {activePriceLevels.slice(0, -1).map((l, i) => {
                                                const next = activePriceLevels[i + 1];
                                                const hyStart = Math.round(by + bh * l.level);
                                                const hyEnd = Math.round(by + bh * next.level);
                                                const hh = hyEnd - hyStart;
                                                if (hh <= 0) return null;
                                                return (
                                                    <rect
                                                        key={`p-fill-${i}`}
                                                        x={bx}
                                                        y={hyStart}
                                                        width={bw}
                                                        height={hh}
                                                        fill={l.color}
                                                        fillOpacity={bgOpacity * 0.5}
                                                    />
                                                );
                                            })}
                                        </>
                                    )}

                                    {/* Vertical time lines + clamped, collision-aware labels */}
                                    {activeTimeLevels.map((l, i) => {
                                        const lx = Math.round(bx + bw * l.level);
                                        const dateStr = formatGannDate(timeAtLevel(l.level));
                                        const topY_clamped = Math.max(LABEL_PAD + 8, by - 5);
                                        const bottomY_clamped = Math.min(
                                            chartDimensions.height - LABEL_PAD,
                                            by + bh + 12
                                        );
                                        return (
                                            <g key={`t-grid-${i}`}>
                                                <line
                                                    x1={lx} y1={by} x2={lx} y2={by + bh}
                                                    stroke={l.color}
                                                    strokeWidth={1}
                                                    strokeOpacity={0.8}
                                                />
                                                {settings.useTopLabels && timeTopVisible[i] && (
                                                    <text
                                                        x={lx} y={topY_clamped}
                                                        fill={l.color} fontSize={10} textAnchor="middle"
                                                        className="pointer-events-none select-none"
                                                    >
                                                        {l.level.toFixed(3)}
                                                    </text>
                                                )}
                                                {settings.useBottomLabels && timeBottomVisible[i] && (
                                                    <text
                                                        x={lx} y={bottomY_clamped}
                                                        fill={l.color} fontSize={9} textAnchor="middle"
                                                        className="pointer-events-none select-none"
                                                    >
                                                        {dateStr}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}

                                    {/* Horizontal price lines + clamped, collision-aware labels */}
                                    {activePriceLevels.map((l, i) => {
                                        const ly = Math.round(by + bh * l.level);
                                        const priceLabel = formatPrice(priceAtLevel(l.level));
                                        const leftX_clamped = Math.max(LABEL_PAD, bx - 5);
                                        const rightX_clamped = Math.min(
                                            chartDimensions.width - LABEL_PAD,
                                            bx + bw + 5
                                        );
                                        return (
                                            <g key={`p-grid-${i}`}>
                                                <line
                                                    x1={bx} y1={ly} x2={bx + bw} y2={ly}
                                                    stroke={l.color}
                                                    strokeWidth={1}
                                                    strokeOpacity={0.8}
                                                />
                                                {settings.useLeftLabels && priceLeftVisible[i] && (
                                                    <text
                                                        x={leftX_clamped} y={ly + 3}
                                                        fill={l.color} fontSize={10} textAnchor="end"
                                                        className="pointer-events-none select-none"
                                                    >
                                                        {priceLabel}
                                                    </text>
                                                )}
                                                {settings.useRightLabels && priceRightVisible[i] && (
                                                    <text
                                                        x={rightX_clamped} y={ly + 3}
                                                        fill={l.color} fontSize={10} textAnchor="start"
                                                        className="pointer-events-none select-none"
                                                    >
                                                        {l.level.toFixed(3)}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}

                                    {/* Outer border */}
                                    <rect
                                        x={bx} y={by} width={bw} height={bh}
                                        fill="none"
                                        stroke={style.color}
                                        strokeWidth={style.width}
                                        strokeDasharray={strokeDasharray}
                                    />

                                    {/* 8-point resize handles when selected */}
                                    {isSelected && (() => {
                                        const nwse =
                                            (x1 < x2 && y1 < y2) || (x1 > x2 && y1 > y2)
                                                ? 'nwse-resize'
                                                : 'nesw-resize';
                                        const nesw = nwse === 'nwse-resize' ? 'nesw-resize' : 'nwse-resize';
                                        return (
                                            <>
                                                {/* Corners */}
                                                <g key="gh-c1">{renderHandle(x1, y1, nwse)}</g>
                                                <g key="gh-c2">{renderHandle(x2, y2, nwse)}</g>
                                                <g key="gh-c3">{renderHandle(x1, y2, nesw)}</g>
                                                <g key="gh-c4">{renderHandle(x2, y1, nesw)}</g>
                                                {/* Edge midpoints */}
                                                <g key="gh-n">{renderHandle(midX, topY, 'n-resize')}</g>
                                                <g key="gh-s">{renderHandle(midX, botY, 's-resize')}</g>
                                                <g key="gh-w">{renderHandle(leftX, midY, 'w-resize')}</g>
                                                <g key="gh-e">{renderHandle(rightX, midY, 'e-resize')}</g>
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
                            const smSize = 6;
                            const smCandleHalf = Math.max(xStep * 0.35, 4);
                            const smColor = '#8b5cf6';

                            // Find actual candle low/high
                            let smCandleLow = d.point.price;
                            let smCandleHigh = d.point.price;
                            if (data.length > 0 && candleInterval > 0) {
                                const smIdx = Math.round((d.point.time - data[0].time) / candleInterval);
                                if (smIdx >= 0 && smIdx < data.length) {
                                    smCandleLow = data[smIdx].low;
                                    smCandleHigh = data[smIdx].high;
                                }
                            }

                            // ▲ below candle low (BUY) or ▼ above candle high (SELL)
                            // centered on smX (candle center)
                            // + tiny ▶ on left side of candle at entry price
                            const belowLow = yScale(smCandleLow) + 8;
                            const aboveHigh = yScale(smCandleHigh) - 8;

                            return (
                                <g key={key} pointerEvents="none">
                                    {smIsBuy ? (
                                        /* ▲ centered below candle low */
                                        <polygon
                                            points={`${smX},${belowLow} ${smX - smSize},${belowLow + smSize * 2} ${smX + smSize},${belowLow + smSize * 2}`}
                                            fill={smColor}
                                            shapeRendering="geometricPrecision"
                                        />
                                    ) : (
                                        /* ▼ centered above candle high */
                                        <polygon
                                            points={`${smX},${aboveHigh} ${smX - smSize},${aboveHigh - smSize * 2} ${smX + smSize},${aboveHigh - smSize * 2}`}
                                            fill={smColor}
                                            shapeRendering="geometricPrecision"
                                        />
                                    )}
                                    {/* Tiny ▶ on left side of candle at entry price */}
                                    <polygon
                                        points={`${smX - smCandleHalf - 9},${smY - 3} ${smX - smCandleHalf - 9},${smY + 3} ${smX - smCandleHalf - 4},${smY}`}
                                        fill={smColor}
                                        shapeRendering="geometricPrecision"
                                    />
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

                        // Get user style settings (indexed keys > legacy keys > kuriPlots > defaults)
                        const indLineWidth =
                            (indicator.settings as any)?.plot_0_linewidth ||
                            (indicator.settings as any)?.lineWidth ||
                            indicator.kuriPlots?.[0]?.linewidth ||
                            2;
                        const indLineStyle =
                            (indicator.settings as any)?.plot_0_linestyle ||
                            (indicator.settings as any)?.lineStyle ||
                            'solid';
                        const styleToDash = (s: string) =>
                            s === 'dashed' ? '6,3' : s === 'dotted' ? '2,2' : undefined;
                        const indDash = styleToDash(indLineStyle);

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
                                'UNKNOWN_REMOVED' as any,
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
                            if (indicator.type === ('UNKNOWN_REMOVED' as any) && seriesColors) {
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
                                        (indicator.settings as any)?.plot_0_color ||
                                        (indicator.settings as any)?.valueColor ||
                                        indicator.settings.color ||
                                        indicator.kuriPlots?.[0]?.color ||
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
                            (indicator.type as any) === ('UNKNOWN_REMOVED' as any) ||
                            (indicator.type as any) === ('UNKNOWN_REMOVED' as any)
                        ) {
                            const values = indicator.data.main || [];
                            const zeroVal = 0 /* removed */ > 0 ? 0 /* removed */ : 0; // Baseline at 0 or bottom of scale
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
                        if (indicator.type === ('UNKNOWN_REMOVED' as any)) {
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
                        if (indicator.type === ('UNKNOWN_REMOVED' as any)) {
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
                                        stroke={getPlotColorByTitle(indicator, 'Upper', color)}
                                        strokeWidth={indLineWidth}
                                        fill="none"
                                    />
                                    <path
                                        d={buildPath(lower)}
                                        stroke={getPlotColorByTitle(indicator, 'Lower', color)}
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
                        if (indicator.type === ('UNKNOWN_REMOVED' as any)) {
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

                            const baseColor = indicator.settings.color || '#2962FF';
                            const upperColor = getPlotColorByTitle(indicator, 'Upper', baseColor);
                            const lowerColor = getPlotColorByTitle(indicator, 'Lower', baseColor);
                            const basisColor = getPlotColorByTitle(indicator, 'Basis', '#FF6D00');

                            return (
                                <g key={indicator.id} pointerEvents="none">
                                    <polygon
                                        points={fillPoints}
                                        fill={upperColor}
                                        fillOpacity="0.1"
                                        stroke="none"
                                    />
                                    <path
                                        d={upperPath}
                                        stroke={upperColor}
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                    <path
                                        d={lowerPath}
                                        stroke={lowerColor}
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                    />
                                    <path
                                        d={middlePath}
                                        stroke={basisColor}
                                        strokeWidth={indLineWidth}
                                        strokeDasharray={indDash}
                                        fill="none"
                                        strokeOpacity="0.7"
                                    />
                                </g>
                            );
                        }

                        if ((indicator.type as string) === 'MA Ribbon') {
                            const paths: React.ReactNode[] = [];
                            if (indicator.data) {
                                let plotIdx = 0;
                                Object.entries(indicator.data).forEach(([key, values]) => {
                                    if (key.startsWith('MA #') || key.match(/^ma\d/)) {
                                        const lineValues = values as (number | null)[];
                                        const path = buildPath(lineValues);
                                        if (path) {
                                            // Use per-plot color from .kuri, fall back to base color
                                            const plotColor = getPlotColor(
                                                indicator,
                                                plotIdx,
                                                '#2962FF'
                                            );
                                            const plotWidth =
                                                (indicator.settings as any)?.[
                                                    `plot_${plotIdx}_linewidth`
                                                ] || 1;
                                            paths.push(
                                                <path
                                                    key={`${indicator.id}-${key}`}
                                                    d={path}
                                                    stroke={plotColor}
                                                    strokeWidth={plotWidth}
                                                    fill="none"
                                                    pointerEvents="none"
                                                />
                                            );
                                        }
                                        plotIdx++;
                                    }
                                });
                            }
                            return <g key={indicator.id}>{paths}</g>;
                        }

                        // Donchian Channels
                        if (
                            indicator.type === 'Donchian' ||
                            (indicator.type as string) === 'DONCHIAN' ||
                            (indicator.type as string) === 'DC' ||
                            (indicator.type as string) === 'Donchian Channels'
                        ) {
                            const upper = indicator.data.upper || [];
                            const lower = indicator.data.lower || [];
                            const basis =
                                indicator.data.middle ||
                                indicator.data.basis ||
                                indicator.data.main ||
                                [];

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
                            (indicator.type as string) === 'ICHIMOKU' ||
                            (indicator.type as string) === 'Ichimoku' ||
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
                            (indicator.type as string) === 'KC' ||
                            (indicator.type as string) === 'KC' ||
                            (indicator.type as string) === 'Keltner Channels'
                        ) {
                            const upper = indicator.data.upper || [];
                            const lower = indicator.data.lower || [];
                            const basis =
                                indicator.data.middle ||
                                indicator.data.basis ||
                                indicator.data.main ||
                                [];
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

                        if (
                            (indicator.type as string) === 'SuperTrend' ||
                            (indicator.type as string) === 'Supertrend'
                        ) {
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
                        if ((indicator.type as any) === ('UNKNOWN_REMOVED' as any)) {
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

                        // Generic fallback: render all Kuri plots as lines/fills
                        // This ensures any indicator type not explicitly handled still renders
                        // Skip this fallback if indicator has kuriPlots — let the
                        // generic Kuri multi-plot renderer (below) handle it properly,
                        // including plotshape/plotchar/plotarrow markers.
                        const plots = indicator.kuriPlots || [];
                        const dataKeys = Object.keys(indicator.data || {});
                        if (plots.length === 0 && dataKeys.length > 0) {
                            const fallbackPaths: React.ReactNode[] = [];
                            {
                                // No kuriPlots metadata — render each data key as a line
                                dataKeys.forEach((key) => {
                                    if (key === 'main' || key === 'value') return; // skip aliases
                                    const values = indicator.data[key] as (number | null)[];
                                    const path = buildPath(values);
                                    if (path) {
                                        fallbackPaths.push(
                                            <path
                                                key={`${indicator.id}-${key}`}
                                                d={path}
                                                stroke={indicator.settings.color || '#2962FF'}
                                                strokeWidth={indLineWidth}
                                                fill="none"
                                                pointerEvents="none"
                                            />
                                        );
                                    }
                                });
                                // If only main/value, render that
                                if (fallbackPaths.length === 0) {
                                    const mainData =
                                        indicator.data.main ||
                                        indicator.data.value ||
                                        indicator.data[dataKeys[0]];
                                    if (mainData) {
                                        const path = buildPath(mainData as (number | null)[]);
                                        if (path) {
                                            fallbackPaths.push(
                                                <path
                                                    key={`${indicator.id}-main`}
                                                    d={path}
                                                    stroke={indicator.settings.color || '#2962FF'}
                                                    strokeWidth={indLineWidth}
                                                    fill="none"
                                                    pointerEvents="none"
                                                />
                                            );
                                        }
                                    }
                                }
                            }
                            if (fallbackPaths.length > 0) {
                                return (
                                    <g key={indicator.id} pointerEvents="none">
                                        {fallbackPaths}
                                    </g>
                                );
                            }
                        }

                        // Generic Kuri multi-plot overlay renderer
                        // Handles any Kuri-driven overlay indicator by reading kuriPlots
                        if (indicator.kuriPlots && indicator.kuriPlots.length > 0) {
                            const elements: React.ReactNode[] = [];
                            indicator.kuriPlots.forEach((plot: any, pi: number) => {
                                const pVisible = (indicator.settings as any)?.[
                                    `plot_${pi}_visible`
                                ];
                                if (pVisible === false) return;
                                const pColor =
                                    (indicator.settings as any)?.[`plot_${pi}_color`] ??
                                    plot.color ??
                                    '#2962FF';
                                const pWidth =
                                    (indicator.settings as any)?.[`plot_${pi}_linewidth`] ??
                                    plot.linewidth ??
                                    2;
                                const pLineStyle =
                                    (indicator.settings as any)?.[`plot_${pi}_linestyle`] ??
                                    'solid';
                                const pDash = styleToDash(pLineStyle);
                                const seriesData =
                                    indicator.data[plot.title] ||
                                    (pi === 0 ? indicator.data.main || indicator.data.value : null);
                                if (!seriesData) return;

                                const plotKind = plot.kind || 'plot';

                                // plotshape / plotchar / plotarrow → SVG shape markers
                                if (plotKind === 'plotshape' || plotKind === 'plotchar' || plotKind === 'plotarrow') {
                                    const shapeStyle = plot.style || 'circle';
                                    const shapeLocation = plot.location || 'abovebar';
                                    const shapeText = plot.text || '';
                                    const shapeTexts = plot.texts as (string | null)[] | null;
                                    const shapeTextColor = plot.textcolor || pColor;
                                    const sz = 5;
                                    const offset = 14; // px offset from bar high/low
                                    for (let i = startIdx; i < endIdx; i++) {
                                        const val = seriesData[i] as any;
                                        if (!val || val === null || (typeof val === 'number' && isNaN(val))) continue;
                                        const x = indexToX(i - view.startIndex);
                                        const candle = data[i];
                                        if (!candle) continue;
                                        let y: number;
                                        if (shapeLocation === 'belowbar') {
                                            y = yScale(candle.low) + offset;
                                        } else if (shapeLocation === 'abovebar') {
                                            y = yScale(candle.high) - offset;
                                        } else if (typeof val === 'number' && val !== 1) {
                                            y = yScale(val);
                                        } else {
                                            y = yScale(candle.high) - offset;
                                        }
                                        // Draw shape
                                        let shapeSvg: React.ReactNode = null;
                                        if (shapeStyle === 'triangleup' || shapeStyle === 'arrowup') {
                                            shapeSvg = <polygon key={`${indicator.id}-sh-${pi}-${i}`} points={`${x},${y - sz} ${x - sz},${y + sz} ${x + sz},${y + sz}`} fill={pColor} />;
                                        } else if (shapeStyle === 'triangledown' || shapeStyle === 'arrowdown') {
                                            shapeSvg = <polygon key={`${indicator.id}-sh-${pi}-${i}`} points={`${x},${y + sz} ${x - sz},${y - sz} ${x + sz},${y - sz}`} fill={pColor} />;
                                        } else if (shapeStyle === 'diamond') {
                                            shapeSvg = <polygon key={`${indicator.id}-sh-${pi}-${i}`} points={`${x},${y - sz} ${x + sz},${y} ${x},${y + sz} ${x - sz},${y}`} fill={pColor} />;
                                        } else if (shapeStyle === 'square') {
                                            shapeSvg = <rect key={`${indicator.id}-sh-${pi}-${i}`} x={x - sz} y={y - sz} width={sz * 2} height={sz * 2} fill={pColor} />;
                                        } else if (shapeStyle === 'cross' || shapeStyle === 'xcross') {
                                            const d = shapeStyle === 'xcross'
                                                ? `M${x - sz},${y - sz}L${x + sz},${y + sz}M${x + sz},${y - sz}L${x - sz},${y + sz}`
                                                : `M${x - sz},${y}L${x + sz},${y}M${x},${y - sz}L${x},${y + sz}`;
                                            shapeSvg = <path key={`${indicator.id}-sh-${pi}-${i}`} d={d} stroke={pColor} strokeWidth={1.5} fill="none" />;
                                        } else {
                                            shapeSvg = <circle key={`${indicator.id}-sh-${pi}-${i}`} cx={x} cy={y} r={sz} fill={pColor} />;
                                        }
                                        elements.push(shapeSvg);
                                        // Render text label (e.g., "FR↑", "FB↓")
                                        const barText = shapeTexts?.[i] || shapeText;
                                        if (barText) {
                                            const textY = shapeLocation === 'belowbar' ? y + sz + 10 : y - sz - 4;
                                            elements.push(
                                                <text
                                                    key={`${indicator.id}-txt-${pi}-${i}`}
                                                    x={x}
                                                    y={textY}
                                                    fill={shapeTextColor}
                                                    fontSize={9}
                                                    fontWeight="bold"
                                                    fontFamily="sans-serif"
                                                    textAnchor="middle"
                                                    dominantBaseline={shapeLocation === 'belowbar' ? 'hanging' : 'auto'}
                                                    pointerEvents="none"
                                                >
                                                    {barText}
                                                </text>
                                            );
                                        }
                                    }
                                    return;
                                }

                                // Regular line plot
                                const path = buildPath(seriesData as (number | null)[]);
                                if (path) {
                                    elements.push(
                                        <path
                                            key={`${indicator.id}-plot-${pi}`}
                                            d={path}
                                            stroke={pColor}
                                            strokeWidth={pWidth}
                                            strokeDasharray={pDash}
                                            fill="none"
                                            pointerEvents="none"
                                        />
                                    );
                                }
                            });
                            if (elements.length > 0) {
                                return <g key={indicator.id} pointerEvents="none">{elements}</g>;
                            }
                        }

                        // Truly nothing to render — log warning
                        const renderWarnKey = `render_${indicator.id}_${indicator.type}`;
                        if (!loggedIndicatorWarnings.current.has(renderWarnKey)) {
                            loggedIndicatorWarnings.current.add(renderWarnKey);
                            addConsoleLog(
                                'warn',
                                'Render',
                                `No rendering handler for indicator type="${indicator.type}" — "${indicator.type || 'unnamed'}" will not be drawn.`,
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
                            `Failed to render "${indicator.type || indicator.type}": ${e instanceof Error ? e.message : String(e)}`,
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

                {/* ── Kuri Engine Drawings (lines, labels, boxes) ── */}
                {overlayIndicators
                    .filter((ind) => ind.kuriDrawings && ind.isVisible !== false)
                    .map((ind) => {
                        const d = ind.kuriDrawings!;
                        const DASH_MAP: Record<string, string | undefined> = {
                            dashed: '8 4',
                            dotted: '2 4',
                        };
                        const SIZE_MAP: Record<string, number> = {
                            tiny: 8,
                            small: 10,
                            normal: 12,
                            large: 14,
                            huge: 18,
                        };
                        // Kuri engine stores time in ms, chart uses seconds
                        const msToChartTime = (ms: number) => ms / 1000;
                        return (
                            <g key={`kuri-drawings-${ind.id}`} className="pointer-events-none">
                                {/* Lines */}
                                {d.lines.map((ln) => {
                                    const x1 = timeToX(msToChartTime(ln.x1));
                                    const y1 = yScale(ln.y1);
                                    const x2 = timeToX(msToChartTime(ln.x2));
                                    const y2 = yScale(ln.y2);
                                    // Skip off-screen lines
                                    if (
                                        (x1 < -200 && x2 < -200) ||
                                        (x1 > chartDimensions.width + 200 &&
                                            x2 > chartDimensions.width + 200)
                                    )
                                        return null;
                                    return (
                                        <line
                                            key={ln.id}
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke={ln.color}
                                            strokeWidth={ln.width}
                                            strokeDasharray={DASH_MAP[ln.style]}
                                        />
                                    );
                                })}
                                {/* Labels */}
                                {d.labels.map((lb) => {
                                    const x = timeToX(msToChartTime(lb.x));
                                    const y = yScale(lb.y);
                                    if (x < -200 || x > chartDimensions.width + 200) return null;
                                    const fontSize = SIZE_MAP[lb.size] || 12;
                                    const hasBg =
                                        lb.bgcolor &&
                                        lb.bgcolor !== 'transparent' &&
                                        lb.bgcolor !== '#00000000';
                                    const textLen = (lb.text?.length || 0) * fontSize * 0.6 + 8;
                                    return (
                                        <g key={lb.id}>
                                            {hasBg && (
                                                <rect
                                                    x={x}
                                                    y={y - fontSize - 2}
                                                    width={textLen}
                                                    height={fontSize + 6}
                                                    rx={2}
                                                    fill={lb.bgcolor}
                                                />
                                            )}
                                            <text
                                                x={x + 4}
                                                y={y - 2}
                                                fill={lb.textcolor}
                                                fontSize={fontSize}
                                                fontFamily="monospace"
                                                dominantBaseline="auto"
                                            >
                                                {lb.text}
                                            </text>
                                        </g>
                                    );
                                })}
                                {/* Boxes */}
                                {d.boxes.map((bx) => {
                                    const x1 = timeToX(msToChartTime(bx.left));
                                    const y1 = yScale(bx.top);
                                    const x2 = timeToX(msToChartTime(bx.right));
                                    const y2 = yScale(bx.bottom);
                                    const rx = Math.min(x1, x2);
                                    const ry = Math.min(y1, y2);
                                    const rw = Math.abs(x2 - x1);
                                    const rh = Math.abs(y2 - y1);
                                    if (rx + rw < -200 || rx > chartDimensions.width + 200)
                                        return null;
                                    return (
                                        <rect
                                            key={bx.id}
                                            x={rx}
                                            y={ry}
                                            width={rw}
                                            height={rh}
                                            fill={bx.bgcolor}
                                            stroke={bx.borderColor}
                                            strokeWidth={bx.borderWidth}
                                        />
                                    );
                                })}
                            </g>
                        );
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
                className="bg-black text-gray-300 flex flex-col h-full w-full overflow-hidden font-sans touch-none relative"
            >
                {/* Indicator Editor — replaces chart when open */}
                <IndicatorEditorPanel
                    isOpen={isIndicatorEditorOpen}
                    onToggle={handleToggleIndicatorEditor}
                    onAddToChart={handleAddCustomIndicator}
                    onScriptSaved={handleIndicatorSaved}
                />

                <div className={isIndicatorEditorOpen ? 'hidden' : 'flex flex-col flex-1 min-h-0'}>
                {!readOnly && (
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
                )}
                <div className="flex-1 flex min-h-0 relative">
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

                                    {selectedDrawingId && floatingToolbarPos && !readOnly && (
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
                                                <div className="absolute z-50 floating-editor-box">
                                                    <style>{`
                                                        .floating-editor-box { left: ${edX}px; top: ${edY}px; width: ${edW}px; }
                                                        .floating-editor-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #c4b5f0; border-radius: 6px 0 0 6px; }
                                                        .floating-editor-textarea {
                                                            width: 100%; height: ${edH}px;
                                                            padding: ${isCallout ? '8px 14px' : '10px 12px 10px 14px'};
                                                            color: #eae6f4; font-size: ${fontSize}px; font-weight: 600;
                                                            font-family: "Inter","SF Pro Display",-apple-system,sans-serif;
                                                            background: #1e1b2e; border: 1.5px solid #c4b5f0;
                                                            border-radius: ${isCallout ? 8 : 6}px; outline: none; resize: none; overflow: hidden;
                                                            line-height: 1.5; box-shadow: 0 0 12px rgba(196,181,240,0.25), 0 4px 16px rgba(0,0,0,0.5);
                                                            text-align: ${isCallout ? 'center' : 'left'};
                                                        }
                                                    `}</style>
                                                    {/* Accent bar for text note */}
                                                    {!isCallout && (
                                                        <div className="floating-editor-accent" />
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
                                                        className="floating-editor-textarea"
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
                                    {!readOnly && <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 opacity-0 hover:opacity-100 transition-opacity duration-300 p-6 pointer-events-none">
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
                                    </div>}
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
                            {panelIndicators.map((indicator) => (
                                <div
                                    key={indicator.id}
                                    className={`h-40 border-t-2 border-[#2A2A2A] flex overflow-hidden ${indicator.isVisible === false ? 'hidden' : ''}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <canvas
                                            ref={(el) => {
                                                const currentRefs = indicatorCanvasRefs.current.get(
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
                                                const currentRefs = indicatorCanvasRefs.current.get(
                                                    indicator.id
                                                ) || { chart: null, yAxis: null };
                                                if (el) {
                                                    indicatorCanvasRefs.current.set(indicator.id, {
                                                        ...currentRefs,
                                                        yAxis: el,
                                                    });
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
                        {isBottomPanelOpen && !readOnly && (
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
                            />
                        )}
                        {!readOnly && <ActiveIndicatorsDisplay
                            indicators={allActiveIndicators}
                            onEdit={openIndicatorSettings}
                            onRemove={handleRemoveIndicator}
                            onToggleVisibility={handleToggleIndicatorVisibility}
                            onToggleAllVisibility={handleToggleAllIndicatorsVisibility}
                            onCreateAlert={handleCreateIndicatorAlert}
                        />}
                    </div>
                    {/* AlertSlidePanel removed — expanded toast editor used instead */}
                    {!isMobile && !readOnly && (
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
                            onToggleIndicatorEditor={handleToggleIndicatorEditor}
                        />
                    )}
                </div>

                </div>

                {isIndicatorPanelOpen && (
                    <IndicatorPanel
                        isOpen={isIndicatorPanelOpen}
                        onClose={() => setIndicatorPanelOpen(false)}
                        onAdd={handleAddIndicator}
                        customScripts={props.customScripts}
                        onAddCustom={handleAddCustomIndicator}
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

                {toastAlert && !editingAlert && (
                    <AlertToast
                        alert={toastAlert.alert}
                        drawing={toastAlert.drawing}
                        indicatorId={toastAlert.indicatorId}
                        indicatorType={toastAlert.indicatorType}
                        onCustomize={() => {
                            setEditingAlert(toastAlert);
                            setToastAlert(null);
                        }}
                        onDismiss={() => setToastAlert(null)}
                    />
                )}
                {editingAlert && (
                    <AlertToast
                        alert={editingAlert.alert}
                        expanded
                        drawing={editingAlert.drawing}
                        indicatorId={editingAlert.indicatorId}
                        indicatorType={editingAlert.indicatorType}
                        onCustomize={() => {}}
                        onDismiss={() => setEditingAlert(null)}
                        onSave={handleSaveAlert}
                        onDelete={handleDeleteAlert}
                    />
                )}
                {contextMenu?.visible && (
                    <ContextMenu
                        {...contextMenu}
                        symbol={props.symbol}
                        lockedTime={lockedVerticalLineTime}
                        onClose={() => setContextMenu(null)}
                        onAddAlert={handleAddAlertAtPrice}
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
