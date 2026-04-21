import React from 'react';

interface Props {
    summary: { total: number; healthy: number; disconnected: number };
    onAdd: () => void;
}

const BrokerConnectHeader: React.FC<Props> = ({ summary, onAdd }) => (
    <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">Broker Connections</h1>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
                Connect your exchange and broker accounts so Insight can place trades on your behalf.
                All keys are encrypted at rest and never leave the server.
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="text-gray-400">{summary.total} connected</span>
                <span className="text-green-400">{summary.healthy} healthy</span>
                <span className="text-red-400">{summary.disconnected} disconnected</span>
            </div>
        </div>
        <button
            type="button"
            onClick={onAdd}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold"
        >
            + Add Connection
        </button>
    </div>
);

export default BrokerConnectHeader;
