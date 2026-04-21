import React from 'react';

interface Props {
    summary: { total: number; active: number; live: number };
    onAdd: () => void;
}

const BrokerConnectHeader: React.FC<Props> = ({ summary, onAdd }) => (
    <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">Broker Connect</h1>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
                Connect your exchange accounts with API keys to enable automated
                trade execution directly from Insight.
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="text-gray-400">
                    {summary.total} {summary.total === 1 ? 'exchange' : 'exchanges'}
                </span>
                <span className="text-green-400">{summary.active} active</span>
                <span className="text-red-400">{summary.live} live</span>
            </div>
        </div>
        <button
            type="button"
            onClick={onAdd}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold flex items-center gap-2"
        >
            <span className="text-lg leading-none">+</span> Add Exchange
        </button>
    </div>
);

export default BrokerConnectHeader;
