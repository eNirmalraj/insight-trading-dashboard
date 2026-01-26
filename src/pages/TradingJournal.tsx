
import React, { useState, useEffect, useMemo } from 'react';
import { Alert, AlertStatus } from '../types';
import {
    AlertIcon, DocumentTextIcon, TrashIcon, PlusIcon,
    ViewListIcon, ViewGridIcon, SearchIcon, TagIcon,
    MarketIcon, FaceSmileIcon, CalendarIcon, TrendingDownIcon,
    ArrowUpIcon, StarIcon, CloseIcon, CameraIcon, UploadIcon
} from '../components/IconComponents';
import * as api from '../api';
import Loader from '../components/Loader';
import { getJournalEntries, saveJournalEntry, deleteJournalEntry, JournalEntry, getJournalStats } from '../services/journalService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const MOOD_EMOJIS: Record<string, string> = {
    'Confident': '😎',
    'Anxious': '😰',
    'Neutral': '😐',
    'Excited': '🤩',
    'Frustrated': '😤',
    'Bored': '🥱',
    'Greedy': '🤑',
    'Fearful': '😨'
};

const SENTIMENT_COLORS: Record<string, string> = {
    'Bullish': 'text-green-400 bg-green-400/10 border-green-400/20',
    'Bearish': 'text-red-400 bg-red-400/10 border-red-400/20',
    'Neutral': 'text-gray-400 bg-gray-400/10 border-gray-400/20',
};

const TagChip: React.FC<{ label: string, onDelete?: () => void }> = ({ label, onDelete }) => (
    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
        #{label}
        {onDelete && (
            <button onClick={onDelete} className="ml-1 hover:text-white">
                &times;
            </button>
        )}
    </span>
);

const StatsCard: React.FC<{ title: string, value: string | number, subtext?: string, icon?: React.ReactNode, valueColor?: string }> = ({ title, value, subtext, icon, valueColor }) => (
    <div className="bg-card-bg border border-gray-700/50 rounded-xl p-4 flex items-start justify-between">
        <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{title}</p>
            <h4 className={`text-2xl font-bold mt-1 ${valueColor || 'text-white'}`}>{value}</h4>
            {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
        </div>
        {icon && <div className="p-2 bg-gray-800 rounded-lg text-gray-400">{icon}</div>}
    </div>
);

// --- Heatmap Component ---
const ActivityHeatmap: React.FC<{ entries: JournalEntry[] }> = ({ entries }) => {
    // Generate last 180 days
    const days = useMemo(() => {
        const d = [];
        const today = new Date();
        for (let i = 179; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            d.push(date.toDateString());
        }
        return d;
    }, []);

    const activityMap = useMemo(() => {
        const map: Record<string, number> = {}; // date -> count or pnl
        entries.forEach(e => {
            const dateStr = new Date(e.timestamp).toDateString();
            map[dateStr] = (map[dateStr] || 0) + 1;
        });
        return map;
    }, [entries]);

    return (
        <div className="flex flex-col">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Activity Map</h4>
            <div className="flex flex-wrap gap-1 w-full max-w-full">
                {days.map(day => {
                    const count = activityMap[day] || 0;
                    let colorClass = 'bg-gray-800';
                    if (count > 0) colorClass = 'bg-blue-900/40';
                    if (count > 1) colorClass = 'bg-blue-700/60';
                    if (count > 3) colorClass = 'bg-blue-500';

                    return (
                        <div
                            key={day}
                            title={`${day}: ${count} entries`}
                            className={`w-3 h-3 rounded-[1px] ${colorClass} hover:ring-1 ring-white/50 transition-all`}
                        />
                    );
                })}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-500">
                <span>Less</span>
                <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 bg-gray-800 rounded-[1px]"></div>
                    <div className="w-2.5 h-2.5 bg-blue-900/40 rounded-[1px]"></div>
                    <div className="w-2.5 h-2.5 bg-blue-700/60 rounded-[1px]"></div>
                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-[1px]"></div>
                </div>
                <span>More</span>
            </div>
        </div>
    );
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg shadow-xl text-xs">
                <p className="text-gray-400 mb-1">{label}</p>
                <p className="font-bold text-white">PnL: <span className={payload[0].value >= 0 ? 'text-green-400' : 'text-red-400'}>${payload[0].value}</span></p>
            </div>
        );
    }
    return null;
};

const TradingJournal: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'journal' | 'news'>('journal');
    const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');

    // Data State
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [stats, setStats] = useState({ totalEntries: 0, winRate: 0, mostTradedSymbol: 'N/A', streak: 0 });
    const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

    // Filter State
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadEntries();
        loadAlerts();
    }, []);

    const loadEntries = async () => {
        const data = await getJournalEntries();
        // Sort by date desc
        data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEntries(data);

        // Stats also need to be awaited or recalculated from entries
        // Since we have the entries locally now, we can calculate stats locally OR await the stats service
        // But getJournalStats logic in service now fetches entries internally. 
        // Better to avoid double fetch. Let's rely on service stats for now or just recalculate.
        // Actually, the service getJournalStats is async now too.
        const s = await getJournalStats();
        setStats(s);
    };

    const loadAlerts = async () => {
        try {
            setIsLoadingAlerts(true);
            const data = await api.getAlerts();
            setAlerts(data.sort((a: Alert, b: Alert) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        } catch (err) {
            console.error("Failed to load alerts", err);
        } finally {
            setIsLoadingAlerts(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete this entry?')) {
            await deleteJournalEntry(id);
            await loadEntries();
        }
    };

    const handleSave = async (entry: any) => {
        await saveJournalEntry(entry);
        await loadEntries();
        setIsModalOpen(false);
        setEditingEntry(null);
    };

    const filteredEntries = useMemo(() => {
        if (!searchTerm) return entries;
        const lower = searchTerm.toLowerCase();
        return entries.filter(e =>
            e.title.toLowerCase().includes(lower) ||
            e.content.toLowerCase().includes(lower) ||
            e.symbol.toLowerCase().includes(lower) ||
            e.tags.some(t => t.toLowerCase().includes(lower))
        );
    }, [entries, searchTerm]);

    // Derived Data for Chart
    const chartData = useMemo(() => {
        // Group PnL by Date approx
        const data: { date: string, pnl: number }[] = [];
        let runningPnL = 0;
        // Sort asc for chart
        const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        sorted.forEach(e => {
            if (e.pnl !== undefined) {
                runningPnL += e.pnl;
                data.push({
                    date: new Date(e.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    pnl: runningPnL
                });
            }
        });
        return data;
    }, [entries]);

    const renderNewsTab = () => (
        <div className="h-full overflow-y-auto p-4">
            {isLoadingAlerts ? <Loader /> : (
                <div className="space-y-2">
                    {alerts.length === 0 && (
                        <div className="text-center py-16 text-gray-500">No alerts found.</div>
                    )}
                    {alerts.map(alert => (
                        <div key={alert.id} className="bg-card-bg border border-gray-700/50 rounded-lg p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-full ${alert.status === AlertStatus.LIVE ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                    <AlertIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-white">{alert.message}</p>
                                    <p className="text-xs text-gray-500">{new Date(alert.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${alert.status === AlertStatus.LIVE ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'}`}>
                                {alert.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-dark-bg text-gray-300 font-sans">
            {/* Minimal Toolbar */}
            <div className="p-3 md:p-4 flex flex-col gap-3 bg-transparent">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex bg-gray-800/50 rounded-lg p-0.5 w-full sm:w-fit">
                        <button
                            onClick={() => setActiveTab('journal')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-medium transition-all ${activeTab === 'journal' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Journal
                        </button>
                        <button
                            onClick={() => setActiveTab('news')}
                            className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-medium transition-all ${activeTab === 'news' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            News & Alerts
                        </button>
                    </div>

                    {activeTab === 'journal' && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                            <div className="relative group flex-1 sm:flex-none">
                                <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex bg-gray-800 rounded-lg border border-gray-700 flex-1 sm:flex-none">
                                    <button onClick={() => setViewMode('list')} className={`flex-1 sm:flex-none p-2 rounded-l-lg ${viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}><ViewListIcon className="w-4 h-4" /></button>
                                    <button onClick={() => setViewMode('gallery')} className={`flex-1 sm:flex-none p-2 rounded-r-lg ${viewMode === 'gallery' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}><ViewGridIcon className="w-4 h-4" /></button>
                                </div>
                                <button
                                    onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}
                                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all hover:scale-105 active:scale-95"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    <span>New Entry</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'news' ? renderNewsTab() : (
                    <div className="h-full overflow-y-auto p-3 md:p-6 pb-24 md:pb-6 scrollbar-thin scrollbar-thumb-gray-800">
                        {/* Analytics Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                            {/* Stats */}
                            <div className="lg:col-span-1 space-y-3 md:space-y-4">
                                <div className="grid grid-cols-2 gap-3 md:gap-4">
                                    <StatsCard title="Total Entries" value={stats.totalEntries} icon={<DocumentTextIcon className="w-4 h-4 md:w-5 md:h-5" />} />
                                    <StatsCard title="Win Rate" value={`${stats.winRate.toFixed(1)}%`} subtext="Based on PnL" icon={<TrendingDownIcon className="w-4 h-4 md:w-5 md:h-5" />} valueColor={stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'} />
                                    <StatsCard title="Top Symbol" value={stats.mostTradedSymbol} icon={<MarketIcon className="w-4 h-4 md:w-5 md:h-5" />} />
                                    <StatsCard title="Streak" value={`${stats.streak} Days`} icon={<CalendarIcon className="w-4 h-4 md:w-5 md:h-5" />} />
                                </div>
                                {/* Heatmap */}
                                <div className="bg-card-bg border border-gray-700/50 rounded-xl p-3 md:p-4 overflow-x-auto">
                                    <ActivityHeatmap entries={entries} />
                                </div>
                            </div>

                            {/* PnL Chart */}
                            <div className="lg:col-span-2 bg-card-bg border border-gray-700/50 rounded-xl p-3 md:p-4 flex flex-col min-h-[200px] md:min-h-0">
                                <h4 className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-3 md:mb-4 flex flex-col sm:flex-row sm:justify-between gap-1">
                                    <span>Cumulative PnL Performance</span>
                                    <span className={chartData.length > 0 && chartData[chartData.length - 1].pnl >= 0 ? 'text-green-400 font-bold text-sm md:text-base' : 'text-red-400 font-bold text-sm md:text-base'}>
                                        {chartData.length > 0 ? `$${chartData[chartData.length - 1].pnl}` : '$0'}
                                    </span>
                                </h4>
                                <div className="flex-1 min-h-[180px] md:min-h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                                            <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} />
                                            <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '5 5' }} />
                                            <Area type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPnl)" activeDot={{ r: 4, strokeWidth: 0 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Recent Entries Header */}
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                Recent Entries <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{filteredEntries.length}</span>
                            </h3>
                        </div>

                        {filteredEntries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 md:p-16 border-2 border-dashed border-gray-800 rounded-xl text-gray-500 group hover:border-gray-700 transition-colors cursor-default">
                                <DocumentTextIcon className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 opacity-20 group-hover:opacity-40 transition-opacity" />
                                <p className="font-medium text-sm md:text-base">No entries found.</p>
                                <p className="text-xs md:text-sm opacity-60">Start by creating a new journal entry.</p>
                            </div>
                        ) : (
                            <div className={viewMode === 'list' ? "space-y-4" : "grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4 md:gap-6"}>
                                {filteredEntries.map(entry => (
                                    <div key={entry.id} className="bg-card-bg border border-gray-700/50 rounded-xl p-5 hover:border-blue-500/30 hover:bg-gray-800/30 transition-all group shadow-sm flex flex-col h-full relative overflow-hidden">

                                        {/* Status Line */}
                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${entry.pnl && entry.pnl > 0 ? 'bg-green-500/50' : entry.pnl && entry.pnl < 0 ? 'bg-red-500/50' : 'bg-gray-700'}`}></div>

                                        <div className="flex justify-between items-start mb-3 pl-2">
                                            <div>
                                                <h4 className="font-bold text-white text-lg line-clamp-1">{entry.title}</h4>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                    <span>{new Date(entry.timestamp).toLocaleDateString()}</span>
                                                    {entry.symbol && <span className="px-1.5 py-0.5 bg-gray-800 rounded text-blue-300 font-mono border border-gray-700">{entry.symbol}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setEditingEntry(entry); setIsModalOpen(true); }} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"><AlertIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(entry.id)} className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-3 pl-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${SENTIMENT_COLORS[entry.sentiment] || SENTIMENT_COLORS['Neutral']}`}>
                                                {entry.sentiment}
                                            </span>
                                            {entry.pnl !== undefined && (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${entry.pnl >= 0 ? 'text-green-400 bg-green-400/10 border-green-500/20' : 'text-red-400 bg-red-400/10 border-red-500/20'}`}>
                                                    {entry.pnl > 0 ? '+' : ''}{entry.pnl} USD
                                                </span>
                                            )}
                                        </div>

                                        {/* Image Thumbnails */}
                                        {entry.images && entry.images.length > 0 && (
                                            <div className="flex gap-2 mb-3 pl-2 overflow-x-auto pb-1 scrollbar-hide">
                                                {entry.images.map((img, i) => (
                                                    <img key={i} src={img} alt="chart" className="h-16 w-24 object-cover rounded-lg border border-gray-700 hover:opacity-90 transition-opacity" />
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-sm text-gray-300 line-clamp-3 mb-4 flex-1 whitespace-pre-wrap pl-2">
                                            {entry.content}
                                        </p>

                                        {entry.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-700/30 pl-2">
                                                {entry.tags.map(t => <TagChip key={t} label={t} />)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Entry Modal */}
            {isModalOpen && (
                <EntryModal
                    entry={editingEntry}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

const EntryModal: React.FC<{ entry: JournalEntry | null, onClose: () => void, onSave: (data: any) => void }> = ({ entry, onClose, onSave }) => {
    const [title, setTitle] = useState(entry?.title || '');
    const [content, setContent] = useState(entry?.content || '');
    const [symbol, setSymbol] = useState(entry?.symbol || '');
    const [sentiment, setSentiment] = useState(entry?.sentiment || 'Neutral');
    const [mood, setMood] = useState(entry?.mood || 'Neutral');
    const [tags, setTags] = useState<string[]>(entry?.tags || []);
    const [tagInput, setTagInput] = useState('');
    const [rating, setRating] = useState(entry?.rating || 3);
    const [pnl, setPnl] = useState<string>(entry?.pnl?.toString() || '');

    // Images
    const [images, setImages] = useState<string[]>(entry?.images || []);

    const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const t = tagInput.trim();
            if (t && !tags.includes(t)) {
                setTags([...tags, t]);
                setTagInput('');
            }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        if (event.target?.result) {
                            setImages(prev => [...prev, event.target!.result as string]);
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
            <div className="bg-[#18181b] w-full sm:max-w-3xl sm:rounded-xl rounded-t-2xl sm:rounded-t-xl border-t sm:border border-gray-700 shadow-2xl overflow-hidden flex flex-col h-[95vh] sm:max-h-[90vh]">
                <div className="p-3 md:p-4 border-b border-gray-700 flex justify-between items-center bg-[#202024]">
                    <h3 className="font-bold text-white text-base md:text-lg flex items-center gap-2">
                        {entry ? 'Edit Entry' : 'New Journal Entry'}
                        <span className="text-[10px] md:text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded hidden md:inline-block">Paste (Ctrl+V) images directly</span>
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-2"><CloseIcon className="w-5 h-5" /></button>
                </div>

                <div className="p-4 md:p-6 overflow-y-auto space-y-3 md:space-y-4 custom-scrollbar" onPaste={handlePaste}>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Title</label>
                        <input
                            value={title} onChange={e => setTitle(e.target.value)}
                            className="w-full bg-black/20 border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none font-medium"
                            placeholder="Brief summary..."
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Symbol</label>
                            <input
                                value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                                className="w-full bg-black/20 border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none font-mono"
                                placeholder="BTC/USDT"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">PnL (USD)</label>
                            <input
                                type="number"
                                value={pnl} onChange={e => setPnl(e.target.value)}
                                className={`w-full bg-black/20 border border-gray-600 rounded-lg p-2.5 focus:border-blue-500 focus:outline-none font-mono ${Number(pnl) > 0 ? 'text-green-400' : Number(pnl) < 0 ? 'text-red-400' : 'text-white'}`}
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Exec. Rating</label>
                            <div className="flex gap-1 bg-black/20 border border-gray-600 rounded-lg p-2.5 justify-center">
                                {[1, 2, 3, 4, 5].map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setRating(r)}
                                        className={`transition-transform hover:scale-110 ${rating >= r ? 'text-yellow-400' : 'text-gray-700'}`}
                                    >
                                        <StarIcon className="w-5 h-5 fill-current" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sentiment</label>
                            <select
                                value={sentiment} onChange={e => setSentiment(e.target.value as any)}
                                className="w-full bg-black/20 border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none appearance-none"
                            >
                                <option value="Bullish">Bullish</option>
                                <option value="Bearish">Bearish</option>
                                <option value="Neutral">Neutral</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Mood</label>
                            <select
                                value={mood} onChange={e => setMood(e.target.value as any)}
                                className="w-full bg-black/20 border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none appearance-none"
                            >
                                {Object.keys(MOOD_EMOJIS).map(m => (
                                    <option key={m} value={m}>{MOOD_EMOJIS[m]} {m}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notes</label>
                        <textarea
                            value={content} onChange={e => setContent(e.target.value)}
                            className="w-full bg-black/20 border border-gray-600 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none h-32 resize-none font-sans leading-relaxed"
                            placeholder="Analysis, mistakes, improvements..."
                        />
                    </div>

                    {/* Image Staging */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Attachments</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {images.map((img, i) => (
                                <div key={i} className="relative group aspect-video bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                                    <img src={img} alt="attachment" className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                                        className="absolute top-1 right-1 p-1 bg-red-500 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <CloseIcon className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            <div className="aspect-video bg-black/20 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-500/50 hover:text-blue-400 transition-colors cursor-pointer relative">
                                <CameraIcon className="w-6 h-6 mb-1" />
                                <span className="text-xs">Paste Image</span>
                                <input
                                    type="text"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onPaste={handlePaste}
                                    readOnly
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tags</label>
                        <div className="flex flex-wrap gap-2 items-center bg-black/20 border border-gray-600 rounded-lg p-2.5">
                            {tags.map(t => <TagChip key={t} label={t} onDelete={() => setTags(tags.filter(tag => tag !== t))} />)}
                            <input
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={handleTagInputKeyDown}
                                placeholder={tags.length === 0 ? "Type and press Enter..." : ""}
                                className="bg-transparent text-sm text-white focus:outline-none flex-1 min-w-[100px]"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-3 md:p-4 border-t border-gray-700 bg-[#202024] flex justify-end gap-2 md:gap-3 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2.5 md:py-2 text-gray-400 hover:text-white text-sm font-medium">Cancel</button>
                    <button
                        onClick={() => onSave({
                            id: entry?.id,
                            title,
                            content,
                            symbol,
                            sentiment,
                            mood,
                            tags,
                            rating,
                            pnl: pnl ? parseFloat(pnl) : undefined,
                            images
                        })}
                        disabled={!title || !content}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 md:py-2 rounded-lg text-sm font-semibold shadow-lg shadow-blue-900/20 transition-all"
                    >
                        Save Entry
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TradingJournal;
