


import React from 'react';
// Fix: Use namespace import for react-router-dom to resolve module resolution issues.
import * as ReactRouterDOM from 'react-router-dom';
import MetricCard from '../components/MetricCard';
// Fix: Remove imports for dummy data that no longer exists in constants.ts
import { ChevronLeftIcon } from '../components/IconComponents';
import { Metric } from '../types';

const DetailedMetricsTable: React.FC<{ data: Record<string, string> }> = ({ data }) => (
    <div className="mt-4 bg-gray-900/50 rounded-lg p-4">
        <table className="w-full text-sm">
            <tbody>
                {Object.entries(data).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-700 last:border-b-0">
                        <td className="py-3 font-medium text-gray-400">{key}</td>
                        <td className="py-3 text-right font-semibold text-white">{value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const DetailedMetrics: React.FC = () => {
    const { accountType } = ReactRouterDOM.useParams<{ accountType: 'forex' | 'binance' }>();
    const navigate = ReactRouterDOM.useNavigate();

    const isForex = accountType === 'forex';
    // This component appears to be unused or will be refactored as AccountMetrics handles fetching.
    // Providing empty arrays to prevent crashes.
    const metrics: Metric[] = [];
    const detailedMetrics: Record<string, string> = {};
    const title = isForex ? 'Forex Account (MT5) Metrics' : 'Binance Account Metrics';

    return (
        <div className="space-y-6">
            <div>
                 <button onClick={() => navigate('/metrics')} className="flex items-center text-sm text-cyan-400 hover:text-cyan-300 mb-4">
                    <ChevronLeftIcon className="w-4 h-4 mr-1" />
                    Back to Metrics Overview
                </button>
                <h1 className="text-2xl font-bold text-white">{title}</h1>
                <p className="text-gray-400 mt-1">A detailed breakdown of your {accountType} account performance.</p>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {metrics.map((metric, index) => (
                        <MetricCard key={index} {...metric} />
                    ))}
                </div>
            </div>

            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                <h2 className="text-xl font-semibold text-white">Performance Statistics</h2>
                <DetailedMetricsTable data={detailedMetrics} />
            </div>
        </div>
    );
};

export default DetailedMetrics;
