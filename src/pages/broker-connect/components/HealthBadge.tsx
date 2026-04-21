import React from 'react';
import { HealthStatus } from '../hooks/useHealthCheck';

interface Props {
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
}

const BADGE: Record<HealthStatus, { dot: string; text: string; bg: string; label: string }> = {
    connected:    { dot: 'bg-green-500',                 text: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Connected' },
    disconnected: { dot: 'bg-red-500',                   text: 'text-red-400',    bg: 'bg-red-500/10',    label: 'Disconnected' },
    untested:     { dot: 'bg-yellow-500',                text: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Untested' },
    testing:      { dot: 'bg-blue-500 animate-pulse',    text: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Testing…' },
    paused:       { dot: 'bg-gray-500',                  text: 'text-gray-400',   bg: 'bg-gray-500/10',   label: 'Paused' },
};

const HealthBadge: React.FC<Props> = ({ status, latencyMs, error }) => {
    const c = BADGE[status];
    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${c.bg} ${c.text}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            <span className="font-medium">{c.label}</span>
            {status === 'connected' && typeof latencyMs === 'number' && (
                <span className="text-gray-500 font-mono">{latencyMs}ms</span>
            )}
            {status === 'disconnected' && error && (
                <span className="text-gray-500 truncate max-w-[12rem]" title={error}>&middot; {error}</span>
            )}
        </div>
    );
};
export default HealthBadge;
