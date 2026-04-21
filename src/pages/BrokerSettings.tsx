// src/pages/BrokerSettings.tsx
import React, { useEffect, useState } from 'react';
import {
    listBrokerCredentials,
    deleteBrokerCredential,
    testBrokerCredential,
    BrokerCredentialInfo,
} from '../services/brokerCredentialService';
import AddBrokerCredentialModal from '../components/AddBrokerCredentialModal';

const BrokerSettings: React.FC = () => {
    const [creds, setCreds] = useState<BrokerCredentialInfo[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [loading, setLoading] = useState(true);

    const reload = async () => {
        try {
            setCreds(await listBrokerCredentials());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this credential? Any active orders will not be affected.')) return;
        await deleteBrokerCredential(id);
        reload();
    };

    const handleVerify = async (id: string) => {
        const result = await testBrokerCredential(id);
        alert(result.ok ? 'Connection OK' : `Connection failed: ${result.error ?? 'unknown error'}`);
        reload();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Broker Connections</h1>
                <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="px-4 py-2 bg-blue-500 text-white rounded font-semibold hover:bg-blue-600"
                >
                    + Add Binance Account
                </button>
            </div>

            {loading ? (
                <div className="text-gray-400">Loading...</div>
            ) : creds.length === 0 ? (
                <div className="p-8 text-center text-gray-400 bg-[#18181b] rounded-xl border border-gray-800">
                    No broker accounts connected. Add one to enable live trading.
                </div>
            ) : (
                <div className="space-y-2">
                    {creds.map((c) => (
                        <div key={c.id} className="flex items-center gap-4 p-4 bg-[#18181b] rounded-xl border border-gray-800">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-white truncate">{c.nickname}</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 uppercase">{c.broker}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase ${c.environment === 'live' || c.environment === 'mainnet' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                        {c.environment ?? 'live'}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {c.last_verified_at ? `Last verified ${new Date(c.last_verified_at).toLocaleString()}` : 'Never verified'}
                                </div>
                            </div>
                            <button type="button" onClick={() => handleVerify(c.id)} className="text-xs px-3 py-1.5 bg-gray-700 text-gray-200 rounded">Test</button>
                            <button type="button" onClick={() => handleDelete(c.id)} className="text-xs px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded">Delete</button>
                        </div>
                    ))}
                </div>
            )}

            <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl text-xs text-gray-400 space-y-2">
                <p className="font-semibold text-white">How to create a Binance API key</p>
                <p>1. Binance Futures -&gt; Account -&gt; API Management -&gt; Create API</p>
                <p>2. Enable <strong>Futures Trading</strong> permission. Do NOT enable Withdrawals.</p>
                <p>3. Restrict by IP: add our server IP (see Settings -&gt; Server IP).</p>
                <p>4. For testnet: Binance retired testnet.binancefuture.com. Create a demo key at <a href="https://demo.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Binance Demo Trading</a> and select "Testnet" when adding it here.</p>
            </div>

            {showAdd && (
                <AddBrokerCredentialModal
                    onClose={() => setShowAdd(false)}
                    onAdded={() => { setShowAdd(false); reload(); }}
                />
            )}
        </div>
    );
};

export default BrokerSettings;
