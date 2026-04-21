import React, { useState } from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { BROKERS } from '../brokerMeta';
import { HealthEntry } from '../hooks/useHealthCheck';
import BrokerIcon from './BrokerIcon';

interface Props {
    credential: BrokerCredentialInfo;
    health: HealthEntry;
    onTest: () => void;
    onEdit?: () => void;
    onRemove: () => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
    onToggleActive: (active: boolean) => Promise<unknown>;
}

function timeAgo(iso: string | null): string {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

function envLabel(env: string | null): string {
    if (!env) return 'Live Trading';
    if (env === 'live' || env === 'mainnet') return 'Live Trading';
    if (env === 'testnet') return 'Testnet';
    if (env === 'demo') return 'Demo';
    return env;
}

function envPillClasses(env: string | null): string {
    const e = env ?? 'live';
    if (e === 'live' || e === 'mainnet') return 'bg-red-500/20 text-red-300';
    if (e === 'testnet' || e === 'demo') return 'bg-blue-500/20 text-blue-300';
    return 'bg-gray-700 text-gray-300';
}

function statusPill(status: string): { classes: string; label: string } {
    switch (status) {
        case 'connected':    return { classes: 'bg-green-500/20 text-green-400',   label: 'Connected' };
        case 'disconnected': return { classes: 'bg-red-500/20 text-red-400',       label: 'Disconnected' };
        case 'paused':       return { classes: 'bg-gray-600/30 text-gray-300',     label: 'Paused' };
        case 'testing':      return { classes: 'bg-blue-500/20 text-blue-400',     label: 'Testing…' };
        default:             return { classes: 'bg-yellow-500/20 text-yellow-400', label: 'Untested' };
    }
}

const CredentialCard: React.FC<Props> = ({
    credential,
    health,
    onTest,
    onEdit,
    onRemove,
    onToggleActive,
}) => {
    const meta = BROKERS[credential.broker];
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [removeError, setRemoveError] = useState<string | null>(null);
    const [toggling, setToggling] = useState(false);

    const handleRemove = async () => {
        setRemoveError(null);
        const r = await onRemove();
        if ('error' in r) {
            setRemoveError(
                r.code === 'active_executions'
                    ? `Blocked: ${r.count} active execution${r.count === 1 ? '' : 's'} use this. Close them first.`
                    : r.error,
            );
            setConfirmRemove(false);
        }
    };

    const handleToggle = async () => {
        if (toggling) return;
        setToggling(true);
        await onToggleActive(!credential.is_active);
        setToggling(false);
    };

    const effectiveStatus: string = !credential.is_active
        ? 'paused'
        : (health?.status ?? 'untested');
    const pill = statusPill(effectiveStatus);

    return (
        <div className="p-5 bg-[#18181b] border border-gray-800 rounded-xl hover:border-gray-700 transition">
            <div className="flex items-start gap-4">
                <BrokerIcon broker={credential.broker} size="lg" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-bold text-lg truncate">{credential.nickname}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${envPillClasses(credential.environment)}`}>
                            {envLabel(credential.environment)}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pill.classes}`}>
                            {pill.label}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
                        <span>{meta.name}</span>
                        <span>·</span>
                        <span className="font-mono">{credential.api_key_preview || '—'}</span>
                        <span>·</span>
                        <span>Tested {timeAgo(credential.last_verified_at)}</span>
                        {effectiveStatus === 'disconnected' && (health?.error || credential.last_test_error) && (
                            <span className="text-red-400 text-xs">
                                · {health?.error ?? credential.last_test_error}
                            </span>
                        )}
                    </div>
                    {credential.is_active && effectiveStatus === 'connected' && credential.permissions.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                            <span className="text-gray-500">Permissions:</span>
                            {credential.permissions.map((p) => (
                                <span
                                    key={p}
                                    className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"
                                >
                                    ✓ {p}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={handleToggle}
                        aria-label={credential.is_active ? 'Pause connection' : 'Resume connection'}
                        disabled={toggling}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                            credential.is_active ? 'bg-green-500/40' : 'bg-gray-700'
                        } ${toggling ? 'opacity-50' : ''}`}
                    >
                        <span
                            className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                                credential.is_active ? 'right-0.5 bg-green-500' : 'left-0.5 bg-gray-400'
                            }`}
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirmRemove(true)}
                        aria-label="Delete"
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                             className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                        </svg>
                    </button>
                </div>
            </div>

            {removeError && (
                <div className="mt-3 p-2 text-xs bg-red-500/10 border border-red-500/30 rounded text-red-300">
                    {removeError}
                </div>
            )}

            {confirmRemove && (
                <div className="mt-3 flex items-center gap-3 text-xs p-2 bg-red-500/5 border border-red-500/20 rounded">
                    <span className="text-red-300">Delete this credential?</span>
                    <button type="button" onClick={handleRemove} className="text-red-300 font-bold hover:text-red-200">
                        Confirm
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(false)} className="text-gray-400 hover:text-gray-300">
                        Cancel
                    </button>
                </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-800/80 flex items-center gap-4 text-sm">
                <button
                    type="button"
                    onClick={onTest}
                    className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium"
                >
                    ▶ Test Connection
                </button>
                {onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-200"
                    >
                        ✎ Edit
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="inline-flex items-center gap-1.5 text-red-400 hover:text-red-300"
                >
                    Remove
                </button>
            </div>
        </div>
    );
};

export default CredentialCard;
