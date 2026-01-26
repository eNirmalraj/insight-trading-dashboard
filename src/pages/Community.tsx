import React, { useState, useEffect } from 'react';
import { getSharedStrategies, likeStrategy } from '../services/socialService';
import { SharedStrategy } from '../types/social';
import Loader from '../components/Loader';
import {
    HeartIcon,
    CloneIcon,
    UserIcon,
    SearchIcon,
    SparklesIcon,
    BookOpenIcon,
    VideoIcon,
    AcademicCapIcon,
    NewspaperIcon,
    PlayIcon,
    GlobeIcon,
    UserGroupIcon
} from '../components/IconComponents';

const Community: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'feed' | 'hub' | 'events'>('feed');
    const [strategies, setStrategies] = useState<SharedStrategy[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('trending'); // trending, new, top

    // --- Feed Data Loading ---
    useEffect(() => {
        if (activeTab === 'feed') {
            loadStrategies();
        }
    }, [activeTab, filter]);

    const loadStrategies = async () => {
        setIsLoading(true);
        try {
            const data = await getSharedStrategies();
            if (filter === 'top') {
                data.sort((a, b) => b.performance_metrics.winRate - a.performance_metrics.winRate);
            } else if (filter === 'trending') {
                data.sort((a, b) => b.likes_count - a.likes_count);
            }
            setStrategies(data);
        } catch (err) {
            console.error('Failed to load community feed', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLike = async (id: string) => {
        try {
            await likeStrategy(id);
            setStrategies(strategies.map(s =>
                s.id === id
                    ? { ...s, likes_count: s.likes_count + 1, is_liked_by_me: true }
                    : s
            ));
        } catch (err) {
            console.error('Failed to like', err);
        }
    };

    // --- Mock Education Data ---
    const educationResources = [
        {
            id: 1,
            title: 'Mastering Price Action',
            type: 'Course',
            duration: '4h 30m',
            level: 'Intermediate',
            image: 'https://images.unsplash.com/photo-1611974765270-ca12586343bb?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
            author: 'Alex Hormozi',
            progress: 0
        },
        {
            id: 2,
            title: 'Algorithmic Trading 101',
            type: 'Video Series',
            duration: '2h 15m',
            level: 'Beginner',
            image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
            author: 'QuantDad',
            progress: 35
        },
        {
            id: 3,
            title: 'Risk Management Mastery',
            type: 'Article',
            duration: '15 min read',
            level: 'Advanced',
            image: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
            author: 'TradingView',
            progress: 100
        },
        {
            id: 4,
            title: 'Bot Strategy Backtesting',
            type: 'Workshop',
            duration: '1h 00m',
            level: 'Advanced',
            image: 'https://images.unsplash.com/photo-1555421689-491a97ff2040?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
            author: 'Insight Team',
            progress: 0
        }
    ];

    // --- Components ---

    const TabButton: React.FC<{ id: string; label: string; icon: any }> = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id as any)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-t-lg transition-all border-b-2 ${activeTab === id
                ? 'border-blue-500 text-white bg-blue-500/5'
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
        >
            <Icon className={`w-4 h-4 ${activeTab === id ? 'text-blue-400' : ''}`} />
            {label}
        </button>
    );

    const FeedSection = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Feed Filters */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-[#202024] p-4 rounded-xl border border-gray-800">
                <div className="flex items-center gap-1 bg-[#18181b] p-1 rounded-lg border border-gray-700">
                    {['trending', 'top', 'new'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all uppercase tracking-wide ${filter === f
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <div className="relative w-full md:w-64">
                    <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                        placeholder="Search strategies..."
                        className="w-full bg-[#18181b] border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>
            </div>

            {/* Strategy Grid */}
            {isLoading ? <Loader /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {strategies.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500 space-y-4">
                            <div className="bg-gray-800/50 p-6 rounded-full">
                                <SparklesIcon className="w-12 h-12 text-gray-600" />
                            </div>
                            <p>No strategies found. Be the first to share one!</p>
                        </div>
                    ) : (
                        strategies.map(strategy => (
                            <div key={strategy.id} className="bg-[#202024] border border-gray-800 rounded-xl overflow-hidden hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all group duration-300">
                                <div className="p-5">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                                                {strategy.author_avatar ? (
                                                    <img src={strategy.author_avatar} className="w-full h-full rounded-full" alt="avatar" />
                                                ) : (
                                                    strategy.author_name.substring(0, 2).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors cursor-pointer">
                                                    {strategy.strategy_name}
                                                </h3>
                                                <p className="text-xs text-gray-500">by {strategy.author_name}</p>
                                            </div>
                                        </div>
                                        <div className={`px-2 py-1 rounded text-xs font-mono font-bold ${strategy.performance_metrics.winRate > 60 ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                                            }`}>
                                            {strategy.performance_metrics.winRate}% WR
                                        </div>
                                    </div>

                                    <p className="text-gray-400 text-sm mb-6 line-clamp-2 h-10 leading-relaxed">
                                        {strategy.description || 'No description provided.'}
                                    </p>

                                    <div className="grid grid-cols-2 gap-2 mb-4">
                                        <div className="bg-[#18181b] p-3 rounded-lg text-center border border-gray-800/50">
                                            <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Profit Factor</span>
                                            <span className="font-mono text-sm text-white font-semibold">{strategy.performance_metrics.profitFactor}</span>
                                        </div>
                                        <div className="bg-[#18181b] p-3 rounded-lg text-center border border-gray-800/50">
                                            <span className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Trades</span>
                                            <span className="font-mono text-sm text-white font-semibold">{strategy.performance_metrics.totalTrades}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                                        <button
                                            onClick={() => handleLike(strategy.id)}
                                            disabled={strategy.is_liked_by_me}
                                            className={`flex items-center gap-2 text-xs font-semibold transition-colors px-3 py-1.5 rounded-full ${strategy.is_liked_by_me
                                                ? 'text-pink-400 bg-pink-500/10'
                                                : 'text-gray-400 hover:text-pink-400 hover:bg-gray-800'
                                                }`}
                                        >
                                            <HeartIcon className={`w-4 h-4 ${strategy.is_liked_by_me ? 'fill-current' : ''}`} />
                                            {strategy.likes_count}
                                        </button>

                                        <button className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-blue-400 transition-colors hover:bg-blue-500/10 px-3 py-1.5 rounded-full">
                                            <CloneIcon className="w-4 h-4" />
                                            Clone Strategy
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );

    const HubSection = () => (
        <div className="space-y-8 animate-fade-in">
            {/* Featured Hero */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-blue-900 to-indigo-900 border border-blue-500/20 shadow-2xl">
                <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1 space-y-4">
                        <span className="inline-block px-3 py-1 bg-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-full">New Course</span>
                        <h2 className="text-3xl md:text-4xl font-bold text-white">Algorithmic Trading Masterclass</h2>
                        <p className="text-blue-100 text-lg max-w-xl">
                            Learn how to build, test, and deploy automated trading strategies using Python and our proprietary engine.
                        </p>
                        <button className="mt-4 px-6 py-3 bg-white text-blue-900 font-bold rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-2">
                            <PlayIcon className="w-5 h-5" /> Start Learning
                        </button>
                    </div>
                    <div className="w-full md:w-1/3 aspect-video bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-white/10 flex items-center justify-center group cursor-pointer hover:border-blue-400/50 transition-all">
                        <PlayIcon className="w-16 h-16 text-white/50 group-hover:text-white group-hover:scale-110 transition-all" />
                    </div>
                </div>
            </div>

            {/* Categories */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { name: 'Courses', icon: BookOpenIcon, count: 12 },
                    { name: 'Videos', icon: VideoIcon, count: 45 },
                    { name: 'Articles', icon: NewspaperIcon, count: 89 },
                    { name: 'Live Events', icon: GlobeIcon, count: 2 },
                ].map((cat) => (
                    <div key={cat.name} className="bg-[#202024] p-4 rounded-xl border border-gray-800 hover:border-blue-500/30 hover:bg-[#25252a] transition-all cursor-pointer group">
                        <cat.icon className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
                        <h3 className="font-bold text-white">{cat.name}</h3>
                        <p className="text-xs text-gray-500">{cat.count} items</p>
                    </div>
                ))}
            </div>

            {/* Resources Grid */}
            <div>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <AcademicCapIcon className="w-6 h-6 text-blue-500" />
                    Latest Resources
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {educationResources.map(resource => (
                        <div key={resource.id} className="bg-[#202024] rounded-xl overflow-hidden border border-gray-800 hover:border-blue-500/30 hover:shadow-xl transition-all group flex flex-col h-full">
                            <div className="relative h-40 overflow-hidden">
                                <img src={resource.image} alt={resource.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-white font-medium">
                                    {resource.type}
                                </div>
                                {resource.progress > 0 && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                                        <div className="h-full bg-green-500" style={{ width: `${resource.progress}%` }}></div>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${resource.level === 'Beginner' ? 'bg-green-500/10 text-green-400' :
                                        resource.level === 'Intermediate' ? 'bg-yellow-500/10 text-yellow-400' :
                                            'bg-red-500/10 text-red-400'
                                        }`}>{resource.level}</span>
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                        <PlayIcon className="w-3 h-3" /> {resource.duration}
                                    </span>
                                </div>
                                <h4 className="font-bold text-white mb-1 group-hover:text-blue-400 transition-colors line-clamp-2">{resource.title}</h4>
                                <p className="text-xs text-gray-500 mb-4">by {resource.author}</p>

                                <div className="mt-auto pt-4 border-t border-gray-800">
                                    <button className="w-full py-2 bg-gray-800 hover:bg-blue-600 text-gray-300 hover:text-white rounded-lg text-sm font-medium transition-all">
                                        {resource.progress > 0 ? 'Continue' : 'Start Now'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-full bg-[#18181b] overflow-y-auto w-full">
            {/* Page Header */}
            <div className="bg-gradient-to-b from-[#1c1c22] to-[#18181b] border-b border-gray-800 sticky top-0 z-10 pt-6 px-6 pb-0">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <UserGroupIcon className="w-8 h-8 text-blue-500" />
                            Community & Hub
                        </h1>
                        <p className="text-gray-400 mt-2 max-w-2xl text-sm md:text-base">
                            The central place for trading knowledge, social strategies, and community events. Learn, share, and grow together.
                        </p>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                        <TabButton id="feed" label="Community Feed" icon={GlobeIcon} />
                        <TabButton id="hub" label="Learning Hub" icon={AcademicCapIcon} />
                        <TabButton id="events" label="Live Events" icon={VideoIcon} />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="max-w-7xl mx-auto p-6 min-h-screen">
                {activeTab === 'feed' && <FeedSection />}
                {activeTab === 'hub' && <HubSection />}
                {activeTab === 'events' && (
                    <div className="text-center py-24 text-gray-500 animate-fade-in">
                        <VideoIcon className="w-16 h-16 mx-auto mb-4 text-gray-700" />
                        <h3 className="text-lg font-bold text-white">No Live Events Currently</h3>
                        <p className="text-sm">Check back later for scheduled webinars and AMAs.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Community;
