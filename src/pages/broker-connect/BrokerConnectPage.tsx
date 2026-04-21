import React, { useMemo, useState } from 'react';
import { useBrokerCredentials } from './hooks/useBrokerCredentials';
import { useHealthCheck } from './hooks/useHealthCheck';
import BrokerConnectHeader from './BrokerConnectHeader';
import CryptoSection from './sections/CryptoSection';
import ForexSection from './sections/ForexSection';
import StockSection from './sections/StockSection';
import AddConnectionWizard from './wizards/AddConnectionWizard';

const BrokerConnectPage: React.FC = () => {
    const { creds, loading, refresh, remove } = useBrokerCredentials();
    const ids = useMemo(() => creds.filter((c) => c.is_active).map((c) => c.id), [creds]);
    const { map: healthMap, testOne, refreshAll } = useHealthCheck(ids);
    const [showWizard, setShowWizard] = useState(false);

    const summary = useMemo(() => {
        const total = creds.length;
        const healthy = Array.from(healthMap.values()).filter((h) => h.status === 'connected').length;
        const disconnected = Array.from(healthMap.values()).filter((h) => h.status === 'disconnected').length;
        return { total, healthy, disconnected };
    }, [creds, healthMap]);

    if (loading) return <div className="p-6 text-gray-400">Loading broker connections…</div>;

    return (
        <div className="p-6 space-y-6">
            <BrokerConnectHeader summary={summary} onAdd={() => setShowWizard(true)} />
            <CryptoSection creds={creds} healthMap={healthMap} onTest={testOne} onRemove={remove} onAdd={() => setShowWizard(true)} />
            <ForexSection  creds={creds} healthMap={healthMap} onTest={testOne} onRemove={remove} onAdd={() => setShowWizard(true)} />
            <StockSection  creds={creds} healthMap={healthMap} onTest={testOne} onRemove={remove} onAdd={() => setShowWizard(true)} />
            {showWizard && (
                <AddConnectionWizard
                    onClose={() => setShowWizard(false)}
                    onAdded={async () => {
                        setShowWizard(false);
                        await refresh();
                        // useHealthCheck's testedIdsRef effect will pick up the new
                        // id automatically on the next render after refresh() resolves.
                    }}
                />
            )}
        </div>
    );
};

export default BrokerConnectPage;
