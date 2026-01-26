import React, { useState, useMemo, useEffect } from 'react';
import MetricCard from '../components/MetricCard';
import DailySummary from '../components/DailySummary';
import StrategyPerformance from '../components/StrategyPerformance';
import AccountPerformanceChart from '../components/AccountPerformanceChart';
import * as api from '../api';
import { Metric } from '../types';
import { BalanceHistoryData, PerformanceData, DailyTradeSummary } from '../constants';
import Loader from '../components/Loader';

type AccountType = 'Forex' | 'Binance';

interface MetricsState {
    metrics: Metric[];
    detailedMetrics: Record<string, string>;
    balanceHistory: BalanceHistoryData[];
}

interface PerformanceState {
    tradeHistory: DailyTradeSummary[];
    strategyPerformance: any; // Using any for mock data structure
}

const DetailedMetricItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="bg-gray-900/50 p-4 rounded-lg flex justify-between items-center border border-gray-700">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-base md:text-lg font-semibold text-white">{value}</span>
    </div>
);

const AccountMetrics: React.FC = () => {
    const [activeAccount, setActiveAccount] = useState<AccountType>('Forex');
    const [accountData, setAccountData] = useState<MetricsState | null>(null);
    const [performanceData, setPerformanceData] = useState<PerformanceState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAccountData = async () => {
            try {
                setIsLoading(true);
                const [metrics, detailed, history] = await Promise.all([
                    api.getAccountMetrics(activeAccount),
                    api.getDetailedMetrics(activeAccount),
                    api.getBalanceHistory(activeAccount)
                ]);
                setAccountData({ metrics, detailedMetrics: detailed, balanceHistory: history });

                if (!performanceData) {
                    const [tradeHistory, strategyPerf] = await Promise.all([
                        api.getTradeHistory(),
                        api.getStrategyPerformanceData()
                    ]);
                    setPerformanceData({ tradeHistory, strategyPerformance: strategyPerf });
                }

                setError(null);
            } catch (err) {
                setError(`Failed to load ${activeAccount} account data.`);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAccountData();
    }, [activeAccount]);

    const { chartColor, gradientId } = useMemo(() => {
        if (activeAccount === 'Forex') {
            return { chartColor: '#3B82F6', gradientId: 'forexBalanceGradient' };
        }
        return { chartColor: '#F59E0B', gradientId: 'binanceBalanceGradient' };
    }, [activeAccount]);

    const accountTabs: { name: AccountType, label: string }[] = [{ name: 'Forex', label: 'Forex Account (MT5)' }, { name: 'Binance', label: 'Binance Account' }];

    return (
        <div className="space-y-6 p-6">
            <div className="bg-card-bg rounded-xl">
                <div className="border-b border-gray-700">
                    <nav className="flex flex-wrap gap-2 p-4" aria-label="Tabs">
                        {accountTabs.map((tab) => (
                            <button
                                key={tab.name}
                                onClick={() => setActiveAccount(tab.name)}
                                className={`px-4 py-2 font-medium text-sm rounded-md transition-colors ${activeAccount === tab.name ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
                {isLoading ? <div className="h-64"><Loader /></div> : error ? <div className="p-6 text-center text-red-400">{error}</div> : accountData && (
                    <>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {accountData.metrics.map((metric, index) => (<MetricCard key={index} {...metric} />))}
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-700 space-y-6">
                            <h2 className="text-lg md:text-xl font-semibold text-white">Performance Statistics</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {Object.entries(accountData.detailedMetrics).map(([key, value]) => (
                                    <DetailedMetricItem key={key} label={key} value={value} />
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {isLoading ? <div className="h-96 rounded-xl bg-card-bg"><Loader /></div> : accountData && (
                <AccountPerformanceChart
                    data={accountData.balanceHistory}
                    lineColor={chartColor}
                    gradientId={gradientId}
                />
            )}

            {performanceData ? (
                <>
                    <StrategyPerformance data={performanceData.strategyPerformance} />
                    <DailySummary tradeHistory={performanceData.tradeHistory} />
                </>
            ) : isLoading ? <div className="h-96 rounded-xl bg-card-bg"><Loader /></div> : null}

        </div>
    );
};

export default AccountMetrics;
