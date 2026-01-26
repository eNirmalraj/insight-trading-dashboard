import React from 'react';
import { FilterIcon } from '../components/IconComponents';

const MarketScreener: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-6 animate-fade-in">
            <div className="bg-blue-500/10 p-6 rounded-full">
                <FilterIcon className="w-16 h-16 text-blue-500" />
            </div>

            <div className="space-y-2">
                <h2 className="text-3xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                    Market Screener
                </h2>
                <h3 className="text-xl font-semibold text-gray-300">
                    Under Construction
                </h3>
            </div>

            <p className="max-w-md text-gray-400 leading-relaxed">
                We're rebuilding the screener from the ground up to provide more powerful filtering and real-time scanning capabilities. Check back soon!
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 mt-4 rounded-full bg-gray-800 border border-gray-700">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
                <span className="text-xs font-medium text-gray-300">Development in Progress</span>
            </div>
        </div>
    );
};

export default MarketScreener;
