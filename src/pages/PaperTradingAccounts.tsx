import React, { useState, useEffect } from 'react';
import { PlusCircleIcon, TrashIcon } from '../components/IconComponents';
import * as api from '../api';
import Loader from '../components/Loader';

interface PaperAccount {
    id: string;
    name: string;
    broker: 'Crypto' | 'Forex' | 'Indian';
    sub_type: 'spot' | 'futures';
    balance: number;
    currency: string;
    created_at: string;
}

// Market-specific currency options
const CURRENCY_OPTIONS = {
    Crypto: ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'TRX'],
    Forex: ['USD', 'EUR', 'GBP', 'AUD', 'CHF'],
    Indian: ['INR']
};

const PaperTradingAccounts: React.FC = () => {
    const [accounts, setAccounts] = useState<PaperAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [addBalanceAccount, setAddBalanceAccount] = useState<PaperAccount | null>(null);
    const [transferAccount, setTransferAccount] = useState<PaperAccount | null>(null);
    const [balanceToAdd, setBalanceToAdd] = useState<number>(0);
    const [transferAmount, setTransferAmount] = useState<number>(0);
    const [transferToId, setTransferToId] = useState<string>('');

    const [formData, setFormData] = useState({
        name: '',
        broker: 'Crypto' as 'Crypto' | 'Forex' | 'Indian',
        sub_type: 'spot' as 'spot' | 'futures',
        balance: 10000,
        currency: 'USDT', // Default for Crypto
    });

    // Update currency when market changes
    useEffect(() => {
        const defaultCurrency = CURRENCY_OPTIONS[formData.broker][0];
        setFormData(prev => ({ ...prev, currency: defaultCurrency }));
    }, [formData.broker]);

    // Load accounts from cache immediately, then fetch fresh data
    useEffect(() => {
        const cacheKey = 'paper_trading_accounts_cache';

        // Try to load from cache first (instant!)
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                const { accounts: cachedAccounts, timestamp } = JSON.parse(cachedData);
                const age = Date.now() - timestamp;

                // Use cache if less than 5 minutes old
                if (age < 5 * 60 * 1000) {
                    console.log('[Paper Trading] Loaded from cache instantly! Age:', age, 'ms');
                    setAccounts(cachedAccounts);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('[Paper Trading] Cache parse error:', err);
            }
        }

        // Always fetch fresh data in parallel
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        console.log('[Paper Trading] Fetching fresh data...');
        const startTime = Date.now();

        try {
            // Don't show loading spinner if we already have cached data
            if (accounts.length === 0) {
                setIsLoading(true);
            }
            setError(null);

            const data = await api.getPaperTradingAccounts();

            console.log('[Paper Trading] Loaded', data.length, 'accounts in', Date.now() - startTime, 'ms');
            setAccounts(data);

            // Cache the results
            localStorage.setItem('paper_trading_accounts_cache', JSON.stringify({
                accounts: data,
                timestamp: Date.now()
            }));
        } catch (err: any) {
            console.error('[Paper Trading] Error loading accounts:', err);
            const errorMsg = err.message || 'Failed to load accounts';
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        const defaultBroker = 'Crypto';
        setFormData({
            name: '',
            broker: defaultBroker,
            sub_type: 'spot',
            balance: 10000,
            currency: CURRENCY_OPTIONS[defaultBroker][0], // USDT for Crypto
        });
    };

    const handleCreateClick = () => {
        resetForm();
        setShowCreateForm(true);
    };

    const handleAddBalanceClick = (account: PaperAccount) => {
        setAddBalanceAccount(account);
        setBalanceToAdd(0);
    };

    const handleAddBalanceSubmit = async () => {
        if (!addBalanceAccount) return;

        if (balanceToAdd === 0) {
            alert('Please enter an amount to add');
            return;
        }

        try {
            const newBalance = addBalanceAccount.balance + balanceToAdd;
            await api.updatePaperTradingAccount(addBalanceAccount.id, { balance: newBalance });

            // Clear cache and reload
            localStorage.removeItem('paper_trading_accounts_cache');
            await loadAccounts();
            setAddBalanceAccount(null);
            setBalanceToAdd(0);
        } catch (err: any) {
            console.error('Error adding balance:', err);
            alert(`Error: ${err.message || 'Failed to add balance'}`);
        }
    };

    const handleTransferClick = (account: PaperAccount) => {
        setTransferAccount(account);
        setTransferAmount(0);
        // Default target is the companion account (Spot <-> Futures)
        const target = accounts.find(a =>
            a.broker === account.broker &&
            a.id !== account.id &&
            a.sub_type !== account.sub_type
        );
        setTransferToId(target?.id || '');
    };

    const handleTransferSubmit = async () => {
        if (!transferAccount || !transferToId) {
            alert('Please select a target account');
            return;
        }

        if (transferAmount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        try {
            await api.transferFunds(transferAccount.id, transferToId, transferAmount);

            // Clear cache and reload
            localStorage.removeItem('paper_trading_accounts_cache');
            await loadAccounts();
            setTransferAccount(null);
            setTransferAmount(0);
        } catch (err: any) {
            console.error('Error transferring funds:', err);
            alert(`Transfer failed: ${err.message || 'Unknown error'}`);
        }
    };

    const handleCancel = () => {
        setShowCreateForm(false);
        resetForm();
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            alert('Please enter an account name');
            return;
        }

        try {
            await api.createPaperTradingAccount(formData);

            // Clear cache and reload
            localStorage.removeItem('paper_trading_accounts_cache');
            await loadAccounts();

            setShowCreateForm(false);
            resetForm();
        } catch (err: any) {
            console.error('Error saving account:', err);
            alert(`Error: ${err.message || 'Failed to save account'}`);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        console.log('Delete requested for:', { id, name });

        if (!confirm(`Are you sure you want to delete "${name}"?`)) {
            console.log('Delete cancelled by user');
            return;
        }

        console.log('Delete confirmed, calling API...');
        try {
            console.log('Calling deletePaperTradingAccount with id:', id);
            await api.deletePaperTradingAccount(id);
            console.log('Delete successful, updating local state');

            // Remove from local state immediately for better UX
            setAccounts(accounts.filter(acc => acc.id !== id));

            // Clear cache
            localStorage.removeItem('paper_trading_accounts_cache');
            console.log('Local state updated');
        } catch (err: any) {
            console.error('Error deleting account:', err);
            console.error('Error details:', {
                message: err.message,
                code: err.code,
                details: err.details,
                hint: err.hint,
                statusCode: err.statusCode
            });

            // Show detailed error to user
            let errorMessage = 'Failed to delete account';
            if (err.message) {
                errorMessage += ': ' + err.message;
            }
            if (err.hint) {
                errorMessage += '\nHint: ' + err.hint;
            }
            alert(`Error: ${errorMessage}`);

            // Reload to sync with server state
            console.log('Reloading accounts from server...');
            localStorage.removeItem('paper_trading_accounts_cache');
            await loadAccounts();
        }
    };

    if (isLoading) {
        return <Loader />;
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
                    <h3 className="text-red-400 font-semibold mb-2">Error Loading Paper Trading Accounts</h3>
                    <p className="text-red-300 text-sm mb-4">{error}</p>
                    <button
                        onClick={loadAccounts}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="bg-card-bg rounded-xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-lg md:text-xl font-semibold text-white">Paper Trading Accounts</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Create virtual trading accounts to test strategies without real money
                        </p>
                    </div>
                    <button
                        onClick={handleCreateClick}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition flex items-center gap-2"
                    >
                        <PlusCircleIcon className="w-5 h-5" />
                        Add Account
                    </button>
                </div>

                {/* Create Account Form */}
                {showCreateForm && (
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6">
                        <h3 className="text-white font-semibold mb-4">Create New Paper Account</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Account Name
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., My Forex Demo"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Market
                                </label>
                                <select
                                    value={formData.broker}
                                    onChange={(e) =>
                                        setFormData({ ...formData, broker: e.target.value as 'Crypto' | 'Forex' | 'Indian' })
                                    }
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="Crypto">Crypto</option>
                                    <option value="Forex">Forex</option>
                                    <option value="Indian">Indian</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Initial Balance
                                </label>
                                <input
                                    type="number"
                                    value={formData.balance}
                                    onChange={(e) =>
                                        setFormData({ ...formData, balance: parseFloat(e.target.value) })
                                    }
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Currency
                                </label>
                                <select
                                    value={formData.currency}
                                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {CURRENCY_OPTIONS[formData.broker].map(curr => (
                                        <option key={curr} value={curr}>{curr}</option>
                                    ))}
                                </select>
                            </div>

                            {formData.broker === 'Crypto' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Wallet Type
                                    </label>
                                    <select
                                        value={formData.sub_type}
                                        onChange={(e) => setFormData({ ...formData, sub_type: e.target.value as 'spot' | 'futures' })}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="spot">Binance Spot</option>
                                        <option value="futures">Binance Futures</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleSubmit}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition"
                            >
                                Create Account
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-medium transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Add Balance Modal */}
                {addBalanceAccount && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full">
                            <h3 className="text-white font-semibold mb-4">Add Balance to {addBalanceAccount.name}</h3>
                            <p className="text-sm text-gray-400 mb-4">
                                Current Balance: <span className="text-white font-semibold">{addBalanceAccount.currency} {addBalanceAccount.balance.toLocaleString()}</span>
                            </p>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    Amount to Add
                                </label>
                                <input
                                    type="number"
                                    value={balanceToAdd}
                                    onChange={(e) => setBalanceToAdd(parseFloat(e.target.value) || 0)}
                                    placeholder="Enter amount"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                />
                                {balanceToAdd !== 0 && (
                                    <p className="text-sm text-gray-400 mt-2">
                                        New Balance: <span className="text-emerald-400 font-semibold">{addBalanceAccount.currency} {(addBalanceAccount.balance + balanceToAdd).toLocaleString()}</span>
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleAddBalanceSubmit}
                                    className="flex-1 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition"
                                >
                                    Add Balance
                                </button>
                                <button
                                    onClick={() => {
                                        setAddBalanceAccount(null);
                                        setBalanceToAdd(0);
                                    }}
                                    className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-medium transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transfer Funds Modal */}
                {transferAccount && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                            <h3 className="text-white font-semibold mb-4">Transfer Funds</h3>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">From</label>
                                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white">
                                        <div className="font-medium">{transferAccount.name}</div>
                                        <div className="text-xs text-gray-400">Balance: {transferAccount.currency} {transferAccount.balance.toLocaleString()}</div>
                                    </div>
                                </div>

                                <div className="flex justify-center -my-2 relative z-10">
                                    <div className="bg-zinc-900 border border-zinc-700 p-1.5 rounded-full">
                                        <PlusCircleIcon className="w-5 h-5 text-gray-500 rotate-45" /> {/* Use as arrow placeholder */}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">To Account</label>
                                    <select
                                        value={transferToId}
                                        onChange={(e) => setTransferToId(e.target.value)}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Target Account</option>
                                        {accounts
                                            .filter(a => a.id !== transferAccount.id && a.broker === transferAccount.broker)
                                            .map(a => (
                                                <option key={a.id} value={a.id}>{a.name} ({a.sub_type})</option>
                                            ))
                                        }
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Amount</label>
                                    <input
                                        type="number"
                                        value={transferAmount}
                                        onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="0.00"
                                        max={transferAccount.balance}
                                    />
                                    <div className="mt-2 flex justify-end">
                                        <button
                                            onClick={() => setTransferAmount(transferAccount.balance)}
                                            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                                        >
                                            Transfer Max
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleTransferSubmit}
                                    disabled={!transferToId || transferAmount <= 0 || transferAmount > transferAccount.balance}
                                    className="flex-1 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition"
                                >
                                    Transfer Now
                                </button>
                                <button
                                    onClick={() => setTransferAccount(null)}
                                    className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-medium transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Accounts List */}
                <div className="space-y-4">
                    {accounts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p>No paper trading accounts yet.</p>
                            <p className="text-sm mt-2">Click "Add Account" to create your first one.</p>
                        </div>
                    ) : (
                        accounts.map((account) => (
                            <div
                                key={account.id}
                                className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 hover:border-zinc-600 transition"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-white font-semibold text-lg">{account.name}</h3>
                                            <span
                                                className={`px-2.5 py-1 text-xs font-semibold rounded-full ${account.broker === 'Crypto'
                                                    ? 'bg-yellow-500/20 text-yellow-400'
                                                    : account.broker === 'Forex'
                                                        ? 'bg-blue-500/20 text-blue-400'
                                                        : 'bg-green-500/20 text-green-400'
                                                    }`}
                                            >
                                                {account.broker}
                                            </span>
                                            {account.broker === 'Crypto' && (
                                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${account.sub_type === 'futures'
                                                    ? 'bg-purple-500/20 text-purple-400'
                                                    : 'bg-emerald-500/20 text-emerald-400'
                                                    }`}>
                                                    {account.sub_type === 'futures' ? 'Perpetual Futures' : 'Spot Wallet'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <p className="text-gray-400">Balance</p>
                                                <p className="text-white font-semibold text-lg">
                                                    {account.currency} {account.balance.toLocaleString()}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Created</p>
                                                <p className="text-white">
                                                    {new Date(account.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        {account.broker === 'Crypto' && (
                                            <button
                                                onClick={() => handleTransferClick(account)}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
                                            >
                                                Transfer
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleAddBalanceClick(account)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
                                        >
                                            + Add Balance
                                        </button>
                                        <button
                                            onClick={() => handleDelete(account.id, account.name)}
                                            className="hover:bg-red-500/10 text-red-400 hover:text-red-300 p-1.5 rounded-lg transition"
                                            title="Delete account"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default PaperTradingAccounts;
