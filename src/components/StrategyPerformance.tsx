import React from 'react';
import { CalendarIcon, BriefcaseIcon, HashIcon, MarketIcon, TrendingDownIcon } from '../components/IconComponents';

// Fix: Update RadialChart to make the 'children' prop optional to fix a type error.
const RadialChart = ({ winPercent, lossPercent, children }: { winPercent: number, lossPercent: number, children?: React.ReactNode }) => {
    const radius = 45;
    const strokeWidth = 10;
    const circumference = 2 * Math.PI * radius;
    const arcLength = circumference * 0.75; // 270 degrees

    const lossDash = (arcLength * lossPercent) / 100;
    const winDash = (arcLength * winPercent) / 100;

    return (
        <div className="relative w-36 h-36">
            <svg className="w-full h-full" viewBox="0 0 100 100" >
                {/* Background */}
                <circle
                    cx="50" cy="50" r={radius}
                    fill="transparent"
                    stroke="#2F2F2F" // gray-700
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${arcLength} ${circumference}`}
                    transform="rotate(135 50 50)"
                />
                {/* Loss Arc */}
                {lossPercent > 0 && <circle
                    cx="50" cy="50" r={radius}
                    fill="transparent"
                    stroke="#EF4444" // red-500
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${lossDash} ${circumference}`}
                    strokeLinecap="round"
                    transform="rotate(135 50 50)"
                />}
                {/* Win Arc */}
                {winPercent > 0 && <circle
                    cx="50" cy="50" r={radius}
                    fill="transparent"
                    stroke="#10B981" // green-500
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${winDash} ${circumference}`}
                    strokeLinecap="round"
                    transform="rotate(45 50 50) scale(-1, 1)"
                />}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {children}
            </div>
        </div>
    );
};


const StatCard = ({ icon, label, value, valueColor = 'text-white' }: { icon: React.ReactNode, label: string, value: string, valueColor?: string }) => (
    <div className="bg-gray-900 p-4 rounded-lg flex items-center">
        <div className="p-2 bg-gray-800 rounded-lg">
            {icon}
        </div>
        <div className="ml-4">
            <p className="text-sm text-gray-400">{label}</p>
            <p className={`text-xl md:text-2xl font-bold ${valueColor}`}>{value}</p>
        </div>
    </div>
);

// Fix: Update AnalysisCard to make the 'children' prop optional to fix a type error.
const AnalysisCard = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div className="bg-gray-900 p-4 rounded-lg flex flex-col items-center">
        <h3 className="text-base md:text-md font-semibold text-white mb-4">{title}</h3>
        {children}
    </div>
);

interface StrategyPerformanceProps {
    data: any; // Using `any` for simplicity with mock data
}

const StrategyPerformance: React.FC<StrategyPerformanceProps> = ({ data }) => {
    // Helper to safely get value or 0
    const stats = data || {};
    const days = stats.totalDays || 0;
    const trades = stats.totalTrades || 0;
    const lots = stats.totalLots || 0;
    const biggestWin = stats.biggestWin || 0;
    const biggestLoss = stats.biggestLoss || 0;

    // Derived stats or defaults
    const winRate = stats.winRate || 0;
    const profitFactor = stats.profitFactor || 0;
    const shortWinRate = stats.shortWinRate || 0;
    const longWinRate = stats.longWinRate || 0;
    const profit = stats.totalProfit || 0;

    return (
        <div className="bg-card-bg p-6 rounded-xl space-y-6">
            <h2 className="text-lg md:text-xl font-semibold text-white">Strategy Performance Analysis</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard icon={<CalendarIcon className="w-5 h-5 text-gray-400" />} label="Number of days" value={days.toString()} />
                <StatCard icon={<HashIcon className="w-5 h-5 text-gray-400" />} label="# Total Trades Taken" value={trades.toString()} />
                <StatCard icon={<BriefcaseIcon className="w-5 h-5 text-gray-400" />} label="Total Lots Used" value={lots.toFixed(2)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard icon={<MarketIcon className="w-5 h-5 text-green-400" />} label="Biggest Win" value={`$${biggestWin.toFixed(2)}`} valueColor="text-green-400" />
                <StatCard icon={<TrendingDownIcon className="w-5 h-5 text-red-400" />} label="Biggest Loss" value={`$${biggestLoss.toFixed(2)}`} valueColor="text-red-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Short Analysis */}
                <AnalysisCard title="Short Analysis">
                    <RadialChart winPercent={shortWinRate} lossPercent={shortWinRate > 0 ? 100 - shortWinRate : 0}>
                        <span className="text-sm text-gray-400">Profit</span>
                        <span className="text-xl md:text-2xl font-bold text-white">$0.00</span>
                    </RadialChart>
                    <div className="w-full grid grid-cols-3 gap-2 text-center mt-4">
                        <div>
                            <p className="text-xs text-gray-400">Wins (0)</p>
                            <p className="text-base font-semibold text-white">$0.00</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Win Rate</p>
                            <p className="text-base font-semibold text-white">{shortWinRate.toFixed(2)}%</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Losses (0)</p>
                            <p className="text-base font-semibold text-white">$0.00</p>
                        </div>
                    </div>
                </AnalysisCard>

                {/* Profitability */}
                <AnalysisCard title="Profitability">
                    <RadialChart winPercent={winRate} lossPercent={winRate > 0 ? 100 - winRate : 0}>
                        <span className="text-sm text-gray-400">Total Trades</span>
                        <span className="text-2xl md:text-3xl font-bold text-white">{trades}</span>
                    </RadialChart>
                    <div className="w-full flex justify-around text-center mt-4">
                        <div>
                            <p className="text-lg font-semibold text-green-400">{winRate.toFixed(1)}%</p>
                            <p className="text-sm text-gray-400">Wins: {stats.wins || 0}</p>
                        </div>
                        <div>
                            <p className="text-lg font-semibold text-red-400">{(winRate > 0 ? 100 - winRate : 0).toFixed(1)}%</p>
                            <p className="text-sm text-gray-400">Losses: {stats.losses || 0}</p>
                        </div>
                    </div>
                </AnalysisCard>

                {/* Long Analysis */}
                <AnalysisCard title="Long Analysis">
                    <RadialChart winPercent={longWinRate} lossPercent={longWinRate > 0 ? 100 - longWinRate : 0}>
                        <span className="text-sm text-gray-400">Profit</span>
                        <span className="text-xl md:text-2xl font-bold text-white">$0.00</span>
                    </RadialChart>
                    <div className="w-full grid grid-cols-3 gap-2 text-center mt-4">
                        <div>
                            <p className="text-xs text-gray-400">Wins (0)</p>
                            <p className="text-base font-semibold text-white">$0.00</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Win Rate</p>
                            <p className="text-base font-semibold text-white">{longWinRate.toFixed(2)}%</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Losses (0)</p>
                            <p className="text-base font-semibold text-white">$0.00</p>
                        </div>
                    </div>
                </AnalysisCard>
            </div>
        </div>
    );
};

export default StrategyPerformance;
