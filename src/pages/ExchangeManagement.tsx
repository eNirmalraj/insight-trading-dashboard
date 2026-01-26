
import React, { useState, useEffect } from 'react';
import { getExchangeKeys, addExchangeKey, deleteExchangeKey, toggleExchangeKeyStatus } from '../services/exchangeService';
import { ExchangeKey } from '../types/exchange';
import Loader from '../components/Loader';
import { TrashIcon, PlusIcon, KeyIcon } from '../components/IconComponents';

const ExchangeManagement: React.FC = () => {
    const [keys, setKeys] = useState<ExchangeKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [nickname, setNickname] = useState('');
    const [exchange, setExchange] = useState<'binance' | 'coinbase'>('binance');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async () => {
        try {
            const data = await getExchangeKeys();
            setKeys(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            await addExchangeKey({ nickname, exchange, api_key: apiKey, api_secret: apiSecret });
            setNickname('');
            setApiKey('');
            setApiSecret('');
            setIsModalOpen(false);
            loadKeys();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this connection?')) return;
        try {
            await deleteExchangeKey(id);
            setKeys(keys.filter(k => k.id !== id));
        } catch (err) {
            alert('Failed to delete key');
        }
    };

    const handleToggle = async (id: string, currentStatus: boolean) => {
        try {
            await toggleExchangeKeyStatus(id, !currentStatus);
            setKeys(keys.map(k => k.id === id ? { ...k, is_active: !currentStatus } : k));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="h-full bg-[#18181b] p-6 overflow-y-auto text-gray-300">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">Exchange Connections</h1>
                        <p className="text-gray-400 text-sm">Link your exchange accounts to enable automated trading.</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Add Connection
                    </button>
                </div>

                {isLoading ? <Loader /> : (
                    <div className="grid grid-cols-1 gap-4">
                        {keys.length === 0 ? (
                            <div className="text-center py-12 bg-[#202024] rounded-xl border border-dashed border-gray-700">
                                <KeyIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-400 text-lg">No exchanges connected.</p>
                                <p className="text-sm text-gray-500">Add a key to get started.</p>
                            </div>
                        ) : (
                            keys.map(key => (
                                <div key={key.id} className="bg-[#202024] border border-gray-700 rounded-xl p-6 flex justify-between items-center group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-[#18181b] rounded-full flex items-center justify-center border border-gray-700">
                                            {/* Simple visual fallback for logos */}
                                            {key.exchange === 'binance' ? <span className="text-yellow-500 font-bold">BNB</span> : <span className="text-blue-500 font-bold">CB</span>}
                                        </div>
                                        <div>
                                            <h3 className="text-white font-bold text-lg">{key.nickname}</h3>
                                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                                <span className="uppercase">{key.exchange}</span>
                                                <span>•</span>
                                                <span className="font-mono">***{key.api_key.slice(-4)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium ${key.is_active ? 'text-green-500' : 'text-gray-500'}`}>
                                                {key.is_active ? 'ACTIVE' : 'PAUSED'}
                                            </span>
                                            <button
                                                onClick={() => handleToggle(key.id, key.is_active)}
                                                className={`w-10 h-5 rounded-full relative transition-colors ${key.is_active ? 'bg-green-500/20' : 'bg-gray-700'}`}
                                            >
                                                <div className={`absolute top-1 bottom-1 w-3 rounded-full transition-all ${key.is_active ? 'right-1 bg-green-500' : 'left-1 bg-gray-500'}`}></div>
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(key.id)}
                                            className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                                            title="Remove Connection"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Add Key Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#202024] w-full max-w-md rounded-xl border border-gray-700 shadow-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-6">Connect New Exchange</h2>

                        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Nickname</label>
                                <input
                                    required
                                    value={nickname}
                                    onChange={e => setNickname(e.target.value)}
                                    placeholder="My Main Account"
                                    className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Exchange</label>
                                <select
                                    value={exchange}
                                    onChange={e => setExchange(e.target.value as any)}
                                    className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                                >
                                    <option value="binance">Binance</option>
                                    <option value="coinbase">Coinbase</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">API Key</label>
                                <input
                                    required
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="Enter API Key"
                                    className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">API Secret</label>
                                <input
                                    required
                                    type="password"
                                    value={apiSecret}
                                    onChange={e => setApiSecret(e.target.value)}
                                    placeholder="Enter API Secret"
                                    className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none font-mono"
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Connecting...' : 'Connect Exchange'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExchangeManagement;
