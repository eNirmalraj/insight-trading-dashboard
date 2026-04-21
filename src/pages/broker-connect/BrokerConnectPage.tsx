import React, { useMemo, useState } from 'react';
import { useBrokerCredentials } from './hooks/useBrokerCredentials';
import { useHealthCheck } from './hooks/useHealthCheck';
import BrokerConnectHeader from './BrokerConnectHeader';
import CredentialCard from './components/CredentialCard';
import AddConnectionWizard from './wizards/AddConnectionWizard';

const BrokerConnectPage: React.FC = () => {
    const { creds, loading, refresh, remove, setActive } = useBrokerCredentials();
    const ids = useMemo(() => creds.filter((c) => c.is_active).map((c) => c.id), [creds]);
    const { map: healthMap, testOne } = useHealthCheck(ids);
    const [showWizard, setShowWizard] = useState(false);

    const summary = useMemo(() => {
        const total = creds.length;
        const active = creds.filter((c) => c.is_active).length;
        const live = creds.filter((c) => c.environment === 'live' || c.environment === 'mainnet').length;
        return { total, active, live };
    }, [creds]);

    if (loading) return <div className="p-6 text-gray-400">Loading broker connections…</div>;

    return (
        <div className="p-6 space-y-6">
            <BrokerConnectHeader summary={summary} onAdd={() => setShowWizard(true)} />

            {creds.length === 0 ? (
                <button
                    type="button"
                    onClick={() => setShowWizard(true)}
                    className="w-full p-8 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-gray-300 hover:border-gray-600 text-center"
                >
                    No exchanges connected yet. Click Add Exchange to get started.
                </button>
            ) : (
                <div className="space-y-3">
                    {creds.map((c) => (
                        <CredentialCard
                            key={c.id}
                            credential={c}
                            health={healthMap.get(c.id) ?? { status: 'untested' }}
                            onTest={() => testOne(c.id)}
                            onRemove={() => remove(c.id)}
                            onToggleActive={(active) => setActive(c.id, active)}
                        />
                    ))}
                </div>
            )}

            {/* How It Works — mirrors the old ExchangeManagement footer */}
            <div className="p-5 bg-gray-900/50 border border-gray-800 rounded-xl">
                <h3 className="text-white font-bold mb-4">How It Works</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        {
                            n: '1',
                            title: 'Create API keys',
                            body: 'Create API keys on your exchange (Binance, Bitget, MT5, Zerodha, etc.) with trading enabled. Never enable withdrawals.',
                        },
                        {
                            n: '2',
                            title: 'Paste your keys here',
                            body: 'Paste your keys here in Insight. Start with Testnet to verify everything works before going live.',
                        },
                        {
                            n: '3',
                            title: 'Trades execute automatically',
                            body: 'When your strategy signals, Insight places the order on your broker with your configured risk.',
                        },
                    ].map((step) => (
                        <div key={step.n} className="space-y-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                                {step.n}
                            </div>
                            <div className="text-sm font-semibold text-white">{step.title}</div>
                            <div className="text-xs text-gray-500">{step.body}</div>
                        </div>
                    ))}
                </div>
            </div>

            {showWizard && (
                <AddConnectionWizard
                    onClose={() => setShowWizard(false)}
                    onAdded={async () => {
                        setShowWizard(false);
                        await refresh();
                    }}
                />
            )}
        </div>
    );
};

export default BrokerConnectPage;
