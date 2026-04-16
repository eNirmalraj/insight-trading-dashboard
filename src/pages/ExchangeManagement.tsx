import React, { useState, useEffect, useCallback } from 'react';
import {
    getExchangeKeys,
    addExchangeKey,
    updateExchangeKey,
    deleteExchangeKey,
    toggleExchangeKeyStatus,
    testExchangeConnection,
    updateExchangeKeyTestResult,
    TestConnectionResult,
} from '../services/exchangeService';
import {
    ExchangeKey,
    EXCHANGES,
    ExchangeName,
} from '../types/exchange';
import Loader from '../components/Loader';
import {
    TrashIcon,
    PlusIcon,
    LinkIcon,
    CheckIcon,
    AlertIcon,
    SendIcon,
    EyeIcon,
    EyeOffIcon,
    KeyIcon,
} from '../components/IconComponents';

// ── Helpers ─────────────────────────────────────────────

const getExchangePreset = (id: ExchangeName) => EXCHANGES.find((e) => e.id === id)!;

const ENV_LABELS: Record<ExchangeKey['environment'], { label: string; color: string }> = {
    live: { label: 'Live Trading', color: 'text-green-400 bg-green-600/20' },
    testnet: { label: 'Testnet', color: 'text-yellow-400 bg-yellow-600/20' },
};

const timeAgo = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

// ── Connection Card ─────────────────────────────────────

const ConnectionCard: React.FC<{
    conn: ExchangeKey;
    onToggle: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onTest: () => void;
    testResult: TestConnectionResult | null;
    isTesting: boolean;
}> = ({ conn, onToggle, onDelete, onEdit, onTest, testResult, isTesting }) => {
    const preset = getExchangePreset(conn.exchange);
    const env = ENV_LABELS[conn.environment];

    return (
        <div className="bg-[#202024] border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
            {/* Main row */}
            <div className="p-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
                        style={{ backgroundColor: preset.color + '20', color: preset.color }}
                    >
                        {preset.logo}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-bold text-lg truncate">
                                {conn.nickname}
                            </h3>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${env.color}`}>
                                {env.label}
                            </span>
                            {conn.is_active ? (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full text-green-400 bg-green-600/20">
                                    Active
                                </span>
                            ) : (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full text-gray-400 bg-gray-700">
                                    Paused
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <span>{preset.name}</span>
                            <span>·</span>
                            <span className="font-mono">***{conn.api_key.slice(-4)}</span>
                            <span>·</span>
                            <span>Tested {timeAgo(conn.last_tested_at)}</span>
                            {conn.last_test_status === 'failed' && (
                                <span className="text-red-400 text-xs">· Failed</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-label={conn.is_active ? 'Pause connection' : 'Activate connection'}
                        className={`w-11 h-6 rounded-full relative transition-colors ${
                            conn.is_active ? 'bg-green-500/30' : 'bg-gray-700'
                        }`}
                    >
                        <div
                            className={`absolute top-1 w-4 h-4 rounded-full transition-all ${
                                conn.is_active ? 'right-1 bg-green-500' : 'left-1 bg-gray-500'
                            }`}
                        />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-500 transition-colors"
                        title="Remove"
                    >
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Permissions row */}
            {conn.permissions.length > 0 && (
                <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">Permissions:</span>
                    {conn.permissions.map((p) => (
                        <span
                            key={p}
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300"
                        >
                            {p}
                        </span>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 bg-[#18181b]/50 border-t border-gray-800 flex items-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={onTest}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 disabled:text-gray-500 font-medium"
                >
                    <SendIcon className="w-4 h-4" />
                    {isTesting ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white font-medium"
                >
                    <KeyIcon className="w-4 h-4" />
                    Edit
                </button>

                {testResult && (
                    <div
                        className={`ml-auto text-xs font-medium flex items-center gap-1 ${
                            testResult.ok ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                        {testResult.ok ? (
                            <CheckIcon className="w-3.5 h-3.5" />
                        ) : (
                            <AlertIcon className="w-3.5 h-3.5" />
                        )}
                        {testResult.ok
                            ? `Connected · ${testResult.latencyMs}ms`
                            : testResult.error || 'Connection failed'}
                    </div>
                )}
            </div>

            {/* Balance preview after successful test */}
            {testResult?.ok && testResult.balancePreview.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-800/50">
                    <p className="text-xs text-gray-500 mb-2">Top Balances</p>
                    <div className="flex items-center gap-4 flex-wrap">
                        {testResult.balancePreview.map((b) => (
                            <div key={b.asset} className="text-sm">
                                <span className="text-white font-medium">{b.free}</span>{' '}
                                <span className="text-gray-500">{b.asset}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Add Exchange Modal ──────────────────────────────────

const AddExchangeModal: React.FC<{
    onClose: () => void;
    onSaved: () => void;
}> = ({ onClose, onSaved }) => {
    const [step, setStep] = useState<'pick' | 'guide' | 'form'>('pick');
    const [exchange, setExchange] = useState<ExchangeName>('binance');
    const [nickname, setNickname] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [environment, setEnvironment] = useState<ExchangeKey['environment']>('testnet');
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const preset = getExchangePreset(exchange);

    const handlePickExchange = (e: ExchangeName) => {
        setExchange(e);
        const p = getExchangePreset(e);
        setNickname(`My ${p.name} Account`);
        setFields({});
        setStep('guide');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!fields.api_key?.trim()) {
            setError('API Key is required.');
            return;
        }
        if (!fields.api_secret?.trim()) {
            setError('API Secret is required.');
            return;
        }
        if (exchange === 'bitget' && !fields.passphrase?.trim()) {
            setError('Passphrase is required for Bitget.');
            return;
        }

        setIsSubmitting(true);
        try {
            await addExchangeKey({
                exchange,
                nickname,
                api_key: fields.api_key.trim(),
                api_secret: fields.api_secret.trim(),
                passphrase: fields.passphrase?.trim(),
                environment,
            });
            onSaved();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#202024] w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">
                        {step === 'pick'
                            ? 'Select Exchange'
                            : step === 'guide'
                              ? `Connect ${preset.name}`
                              : `Enter API Keys`}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>

                {/* Step 1: Pick exchange */}
                {step === 'pick' && (
                    <div className="p-6 space-y-3">
                        {EXCHANGES.map((ex) => (
                            <button
                                key={ex.id}
                                type="button"
                                onClick={() => handlePickExchange(ex.id)}
                                className="w-full flex items-start gap-4 p-4 bg-[#18181b] border border-gray-700 rounded-xl hover:border-gray-500 transition-colors text-left group"
                            >
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-lg"
                                    style={{
                                        backgroundColor: ex.color + '20',
                                        color: ex.color,
                                    }}
                                >
                                    {ex.logo}
                                </div>
                                <div className="flex-1">
                                    <p className="text-white font-semibold group-hover:text-blue-400 transition-colors">
                                        {ex.name}
                                    </p>
                                    <p className="text-gray-500 text-sm mt-0.5">
                                        {ex.description}
                                    </p>
                                    <div className="flex gap-1.5 mt-2">
                                        {ex.features.map((f) => (
                                            <span
                                                key={f}
                                                className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
                                            >
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Step 2: Setup guide */}
                {step === 'guide' && (
                    <div className="p-6 space-y-5">
                        <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4">
                            <h3 className="text-blue-300 font-semibold text-sm mb-3">
                                How to create your {preset.name} API Key
                            </h3>
                            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                                <li>
                                    Log in to{' '}
                                    <a
                                        href={preset.apiKeyGuideUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 underline hover:text-blue-300"
                                    >
                                        {preset.name}
                                    </a>{' '}
                                    and go to <strong>API Management</strong>
                                </li>
                                <li>
                                    Click <strong>"Create API"</strong> and complete 2FA
                                    verification
                                </li>
                                <li>
                                    Enable{' '}
                                    <strong>
                                        "Enable Spot &amp; Margin Trading"
                                        {preset.features.includes('Futures') &&
                                            ' and "Enable Futures"'}
                                    </strong>
                                </li>
                                <li>
                                    <span className="text-red-400 font-medium">
                                        IMPORTANT: Keep "Enable Withdrawals" DISABLED
                                    </span>{' '}
                                    — Insight never needs withdrawal access
                                </li>
                                {preset.id === 'bitget' && (
                                    <li>
                                        Set a <strong>passphrase</strong> — you'll need it in the
                                        next step
                                    </li>
                                )}
                                <li>
                                    Copy the <strong>API Key</strong>
                                    {preset.id === 'bitget' ? ', ' : ' and '}
                                    <strong>Secret Key</strong>
                                    {preset.id === 'bitget' && (
                                        <>
                                            , and <strong>Passphrase</strong>
                                        </>
                                    )}
                                </li>
                            </ol>
                        </div>

                        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3">
                            <p className="text-sm text-red-300">
                                <strong>Security:</strong> Never enable withdrawals. Insight only
                                needs trading permissions. Your API secret is encrypted and stored
                                securely.
                            </p>
                        </div>

                        <div className="flex justify-between items-center pt-1">
                            <button
                                type="button"
                                onClick={() => setStep('pick')}
                                className="text-gray-400 hover:text-white text-sm"
                            >
                                &larr; Back
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep('form')}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium transition-colors"
                            >
                                I've created my API key &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Enter credentials */}
                {step === 'form' && (
                    <form
                        onSubmit={handleSubmit}
                        className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
                    >
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                                {error}
                            </div>
                        )}

                        {/* Nickname */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Nickname
                            </label>
                            <input
                                required
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="My Main Account"
                                className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                A label to help you identify this connection.
                            </p>
                        </div>

                        {/* Dynamic fields per exchange */}
                        {preset.fields.map((field) => (
                            <div key={field.key}>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    {field.label}
                                </label>
                                <div className="relative">
                                    <input
                                        required
                                        value={fields[field.key] || ''}
                                        onChange={(e) =>
                                            setFields((prev) => ({
                                                ...prev,
                                                [field.key]: e.target.value,
                                            }))
                                        }
                                        type={
                                            field.secret && !showSecrets[field.key]
                                                ? 'password'
                                                : 'text'
                                        }
                                        placeholder={field.placeholder}
                                        className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 pr-10 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                                    />
                                    {field.secret && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowSecrets((prev) => ({
                                                    ...prev,
                                                    [field.key]: !prev[field.key],
                                                }))
                                            }
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                            aria-label={
                                                showSecrets[field.key] ? 'Hide' : 'Show'
                                            }
                                        >
                                            {showSecrets[field.key] ? (
                                                <EyeOffIcon className="w-5 h-5" />
                                            ) : (
                                                <EyeIcon className="w-5 h-5" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Environment */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Environment
                            </label>
                            <div className="flex gap-2">
                                {(['testnet', 'live'] as const).map((env) => (
                                    <button
                                        key={env}
                                        type="button"
                                        onClick={() => setEnvironment(env)}
                                        className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                                            environment === env
                                                ? env === 'live'
                                                    ? 'bg-green-600/20 border-green-600/40 text-green-400'
                                                    : 'bg-yellow-600/20 border-yellow-600/40 text-yellow-400'
                                                : 'bg-[#18181b] border-gray-700 text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        {env === 'testnet' ? 'Testnet (Safe)' : 'Live Trading'}
                                    </button>
                                ))}
                            </div>
                            {environment === 'live' && (
                                <p className="text-xs text-yellow-400 mt-1.5">
                                    Real money. Signals executed through this connection will place
                                    actual trades on {preset.name}.
                                </p>
                            )}
                            {environment === 'testnet' && (
                                <p className="text-xs text-gray-500 mt-1.5">
                                    Uses {preset.name}'s testnet. No real money is at risk.
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex justify-between items-center pt-2">
                            <button
                                type="button"
                                onClick={() => setStep('guide')}
                                className="text-gray-400 hover:text-white text-sm"
                            >
                                &larr; Back
                            </button>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-gray-400 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                                >
                                    {isSubmitting ? 'Connecting…' : 'Connect Exchange'}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ── Edit Connection Modal ───────────────────────────────

const EditExchangeModal: React.FC<{
    conn: ExchangeKey;
    onClose: () => void;
    onSaved: () => void;
}> = ({ conn, onClose, onSaved }) => {
    const preset = getExchangePreset(conn.exchange);
    const [nickname, setNickname] = useState(conn.nickname);
    const [environment, setEnvironment] = useState<ExchangeKey['environment']>(conn.environment);
    const [fields, setFields] = useState<Record<string, string>>({});
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);

        try {
            const updates: Record<string, any> = { nickname, environment };

            // Only include key fields if user typed new values
            if (fields.api_key?.trim()) updates.api_key = fields.api_key.trim();
            if (fields.api_secret?.trim()) updates.api_secret = fields.api_secret.trim();
            if (fields.passphrase?.trim()) updates.passphrase = fields.passphrase.trim();

            await updateExchangeKey(conn.id, updates);
            onSaved();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#202024] w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">
                        Edit {conn.nickname}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Nickname
                        </label>
                        <input
                            required
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="My Main Account"
                            aria-label="Connection nickname"
                            className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    {/* Update API keys (optional — leave blank to keep existing) */}
                    <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-3">
                        <p className="text-xs text-gray-500">
                            Leave blank to keep your existing keys. Only fill these to rotate
                            credentials.
                        </p>
                        {preset.fields.map((field) => (
                            <div key={field.key}>
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    {field.label}
                                </label>
                                <div className="relative">
                                    <input
                                        value={fields[field.key] || ''}
                                        onChange={(e) =>
                                            setFields((prev) => ({
                                                ...prev,
                                                [field.key]: e.target.value,
                                            }))
                                        }
                                        type={
                                            field.secret && !showSecrets[field.key]
                                                ? 'password'
                                                : 'text'
                                        }
                                        placeholder={`••••••••  (keep existing)`}
                                        className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 pr-10 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                                    />
                                    {field.secret && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowSecrets((prev) => ({
                                                    ...prev,
                                                    [field.key]: !prev[field.key],
                                                }))
                                            }
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                            aria-label={showSecrets[field.key] ? 'Hide' : 'Show'}
                                        >
                                            {showSecrets[field.key] ? (
                                                <EyeOffIcon className="w-5 h-5" />
                                            ) : (
                                                <EyeIcon className="w-5 h-5" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Environment */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Environment
                        </label>
                        <div className="flex gap-2">
                            {(['testnet', 'live'] as const).map((env) => (
                                <button
                                    key={env}
                                    type="button"
                                    onClick={() => setEnvironment(env)}
                                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium border transition-colors ${
                                        environment === env
                                            ? env === 'live'
                                                ? 'bg-green-600/20 border-green-600/40 text-green-400'
                                                : 'bg-yellow-600/20 border-yellow-600/40 text-yellow-400'
                                            : 'bg-[#18181b] border-gray-700 text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {env === 'testnet' ? 'Testnet (Safe)' : 'Live Trading'}
                                </button>
                            ))}
                        </div>
                        {environment === 'live' && (
                            <p className="text-xs text-yellow-400 mt-1.5">
                                Real money. Signals will place actual trades.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
                        >
                            {isSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Main Page ───────────────────────────────────────────

const ExchangeManagement: React.FC = () => {
    const [keys, setKeys] = useState<ExchangeKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editConn, setEditConn] = useState<ExchangeKey | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, TestConnectionResult>>({});

    const loadKeys = useCallback(async () => {
        try {
            const data = await getExchangeKeys();
            setKeys(data);
        } catch (err) {
            console.error('Failed to load exchange keys:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadKeys();
    }, [loadKeys]);

    const handleToggle = async (key: ExchangeKey) => {
        try {
            await toggleExchangeKeyStatus(key.id, !key.is_active);
            setKeys((prev) =>
                prev.map((k) =>
                    k.id === key.id ? { ...k, is_active: !key.is_active } : k
                )
            );
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (id: string) => {
        if (
            !window.confirm(
                'Remove this exchange connection? Any strategies linked to it will stop executing.'
            )
        )
            return;
        try {
            await deleteExchangeKey(id);
            setKeys((prev) => prev.filter((k) => k.id !== id));
        } catch {
            alert('Failed to remove connection.');
        }
    };

    const handleTest = async (key: ExchangeKey) => {
        setTestingId(key.id);
        const result = await testExchangeConnection(key);
        setTestResults((prev) => ({ ...prev, [key.id]: result }));

        // Persist result
        try {
            await updateExchangeKeyTestResult(
                key.id,
                result.ok ? 'success' : 'failed',
                result.permissions
            );
            setKeys((prev) =>
                prev.map((k) =>
                    k.id === key.id
                        ? {
                              ...k,
                              last_tested_at: new Date().toISOString(),
                              last_test_status: result.ok ? 'success' : 'failed',
                              permissions: result.permissions,
                          }
                        : k
                )
            );
        } catch {
            /* non-blocking */
        }
        setTestingId(null);
    };

    const activeCount = keys.filter((k) => k.is_active).length;
    const liveCount = keys.filter((k) => k.environment === 'live' && k.is_active).length;

    return (
        <div className="h-full bg-[#18181b] overflow-y-auto text-gray-300">
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="flex justify-between items-start mb-8 gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">Broker Connect</h1>
                        <p className="text-gray-400 text-sm max-w-lg">
                            Connect your exchange accounts with API keys to enable automated trade
                            execution directly from Insight.
                        </p>
                        {keys.length > 0 && (
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                                <span>
                                    {keys.length} exchange{keys.length !== 1 ? 's' : ''}
                                </span>
                                <span>{activeCount} active</span>
                                {liveCount > 0 && (
                                    <span className="text-green-400 font-medium">
                                        {liveCount} live
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-colors shrink-0"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Add Exchange
                    </button>
                </div>

                {/* Connection list */}
                {isLoading ? (
                    <Loader />
                ) : keys.length === 0 ? (
                    <div className="text-center py-16 bg-[#202024] rounded-xl border border-dashed border-gray-700">
                        <KeyIcon className="w-14 h-14 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 text-lg font-medium">
                            No exchanges connected
                        </p>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                            Connect your Binance or Bitget account to start executing trades
                            automatically from your strategies.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="mt-5 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Connect Your First Exchange
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {keys.map((key) => (
                            <ConnectionCard
                                key={key.id}
                                conn={key}
                                onToggle={() => handleToggle(key)}
                                onDelete={() => handleDelete(key.id)}
                                onEdit={() => setEditConn(key)}
                                onTest={() => handleTest(key)}
                                testResult={testResults[key.id] ?? null}
                                isTesting={testingId === key.id}
                            />
                        ))}
                    </div>
                )}

                {/* How it works */}
                <div className="mt-10 bg-[#202024] border border-gray-700 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-3">How It Works</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                        <div>
                            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-2">
                                1
                            </div>
                            <p className="text-gray-400">
                                <strong className="text-white">Create API keys</strong> on your
                                exchange (Binance, Bitget) with{' '}
                                <span className="text-yellow-400">trading enabled</span> and{' '}
                                <span className="text-red-400">withdrawals disabled</span>.
                            </p>
                        </div>
                        <div>
                            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-2">
                                2
                            </div>
                            <p className="text-gray-400">
                                <strong className="text-white">Paste your keys</strong> here in
                                Insight. Start with Testnet to verify everything works safely.
                            </p>
                        </div>
                        <div>
                            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-2">
                                3
                            </div>
                            <p className="text-gray-400">
                                <strong className="text-white">Trades execute automatically.</strong>{' '}
                                When your strategy signals, Insight places the order on your
                                exchange instantly.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Security notice */}
                <div className="mt-4 bg-[#202024] border border-gray-700 rounded-xl p-4 flex items-start gap-3">
                    <AlertIcon className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-400">
                        <strong className="text-white">Your keys are safe.</strong> API keys are
                        encrypted at rest and transmitted over TLS. Insight{' '}
                        <strong>never</strong> requests withdrawal permissions. Always keep
                        withdrawals disabled on your API key and use testnet first to verify
                        your setup.
                    </div>
                </div>
            </div>

            {/* Modal */}
            {showAddModal && (
                <AddExchangeModal
                    onClose={() => setShowAddModal(false)}
                    onSaved={() => {
                        setShowAddModal(false);
                        loadKeys();
                    }}
                />
            )}
            {editConn && (
                <EditExchangeModal
                    conn={editConn}
                    onClose={() => setEditConn(null)}
                    onSaved={() => {
                        setEditConn(null);
                        loadKeys();
                    }}
                />
            )}
        </div>
    );
};

export default ExchangeManagement;
