import React, { useState } from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { BROKERS } from '../brokerMeta';
import { HealthEntry } from '../hooks/useHealthCheck';
import BrokerIcon from './BrokerIcon';
import HealthBadge from './HealthBadge';
import PermissionChips from './PermissionChips';

interface Props {
    credential: BrokerCredentialInfo;
    health: HealthEntry;
    onTest: () => void;
    onEdit?: () => void;
    onRemove: () => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
}

function timeAgo(iso: string | null): string {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

const CredentialCard: React.FC<Props> = ({ credential, health, onTest, onEdit, onRemove }) => {
    const meta = BROKERS[credential.broker];
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [removeError, setRemoveError] = useState<string | null>(null);

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

    const envLabel = credential.environment ?? 'live';
    const envColor = envLabel === 'live' || envLabel === 'mainnet'
        ? 'bg-red-500/20 text-red-300'
        : envLabel === 'testnet' || envLabel === 'demo'
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-gray-700 text-gray-300';

    return (
        <div className="p-4 bg-[#18181b] border border-gray-800 rounded-xl hover:border-gray-700 transition">
            <div className="flex items-center gap-3">
                <BrokerIcon broker={credential.broker} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">{credential.nickname}</span>
                        <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${envColor}`}>
                            {envLabel}
                        </span>
                        <HealthBadge
                            status={!credential.is_active ? 'paused' : (health?.status ?? 'untested')}
                            latencyMs={health?.latencyMs}
                            error={credential.is_active ? (health?.error ?? credential.last_test_error ?? undefined) : undefined}
                        />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {meta.name} &middot; <span className="font-mono">{credential.api_key_preview || '—'}</span>
                        &middot; Tested {timeAgo(credential.last_verified_at)}
                    </div>
                </div>
            </div>

            {health?.status === 'connected' && <PermissionChips permissions={credential.permissions} />}

            {removeError && (
                <div className="mt-2 p-2 text-xs bg-red-500/10 border border-red-500/30 rounded text-red-300">
                    {removeError}
                </div>
            )}

            <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                    type="button"
                    onClick={onTest}
                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                >
                    &#9654; Test Connection
                </button>
                {onEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex items-center gap-1 text-gray-300 hover:text-white"
                    >
                        Edit
                    </button>
                )}
                {!confirmRemove ? (
                    <button
                        type="button"
                        onClick={() => setConfirmRemove(true)}
                        className="inline-flex items-center gap-1 text-red-400 hover:text-red-300"
                    >
                        Remove
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="inline-flex items-center gap-1 text-red-300 font-bold"
                        >
                            Confirm delete
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmRemove(false)}
                            className="text-gray-400"
                        >
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
export default CredentialCard;
