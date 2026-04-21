import React from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { categoryOf } from '../brokerMeta';
import CredentialCard from '../components/CredentialCard';
import { HealthEntry } from '../hooks/useHealthCheck';

interface Props {
    creds: BrokerCredentialInfo[];
    healthMap: Map<string, HealthEntry>;
    onTest: (id: string) => void;
    onRemove: (id: string) => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
    onAdd: () => void;
}

const ForexSection: React.FC<Props> = ({ creds, healthMap, onTest, onRemove, onAdd }) => {
    const items = creds.filter((c) => categoryOf(c.broker) === 'forex');
    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Forex &amp; Indices</h2>
                {items.length > 0 && (
                    <button type="button" onClick={onAdd} className="text-xs text-blue-400 hover:text-blue-300">
                        + Add
                    </button>
                )}
            </div>
            {items.length === 0 ? (
                <button
                    type="button"
                    onClick={onAdd}
                    className="w-full p-6 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-gray-300 hover:border-gray-600"
                >
                    Connect your MT5 broker account to trade forex and indices
                </button>
            ) : (
                <div className="space-y-2">
                    {items.map((c) => (
                        <CredentialCard
                            key={c.id}
                            credential={c}
                            health={healthMap.get(c.id) ?? { status: 'untested' }}
                            onTest={() => onTest(c.id)}
                            onRemove={() => onRemove(c.id)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
export default ForexSection;
