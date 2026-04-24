import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    getExchangeKeys,
    addExchangeKey,
    updateExchangeKey,
    deleteExchangeKey,
    toggleExchangeKeyStatus,
    testExchangeConnection,
    updateExchangeKeyTestResult,
    TestConnectionResult,
} from '../../services/exchangeService';
import {
    ExchangeKey,
    EXCHANGES,
    ExchangeName,
    ExchangeCategory,
} from '../../types/exchange';
import Loader from '../../components/Loader';
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
} from '../../components/IconComponents';
import { useAuth } from '../../context/AuthContext';

// ════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════

const getPreset = (id: ExchangeName) => EXCHANGES.find((e) => e.id === id)!;

const CATEGORY_LABELS: Record<ExchangeCategory, string> = {
    crypto: 'Crypto Exchanges',
    forex: 'Forex Brokers',
    indian: 'Indian Stock Brokers (NSE / BSE)',
};

const ENV_LABELS: Record<ExchangeKey['environment'], { label: string; color: string }> = {
    live: { label: 'Live', color: 'text-green-400 bg-green-600/20' },
    demo: { label: 'Demo', color: 'text-yellow-400 bg-yellow-600/20' },
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

const renderMarkdown = (text: string): string =>
    text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>')
        .replace(/IMPORTANT:(.*?)(<|$)/g, '<span class="text-red-400 font-medium">IMPORTANT:$1</span>$2');

// ════════════════════════════════════════════════════════
// Connection Card
// ════════════════════════════════════════════════════════

const ConnectionCard: React.FC<{
    conn: ExchangeKey;
    onToggle: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onTest: () => void;
    testResult: TestConnectionResult | null;
    isTesting: boolean;
}> = ({ conn, onToggle, onDelete, onEdit, onTest, testResult, isTesting }) => {
    const preset = getPreset(conn.exchange);
    const env = ENV_LABELS[conn.environment];

    return (
        <div className="bg-[#202024] border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors">
            {/* Top row */}
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
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
                            <span>{preset.name}</span>
                            <span>·</span>
                            <span className="font-mono text-xs">
                                {conn.exchange === 'mt5'
                                    ? (conn.mt5_server || 'MT5')
                                    : conn.client_id
                                      ? conn.client_id
                                      : conn.api_key
                                        ? `***${conn.api_key.slice(-4)}`
                                        : 'Connected'}
                            </span>
                            <span>·</span>
                            <span>Tested {timeAgo(conn.last_tested_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-label={conn.is_active ? 'Pause' : 'Activate'}
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
                </div>
            </div>

            {/* Permissions */}
            {(conn.permissions.length > 0 || (testResult?.ok && testResult.permissions.length > 0)) && (
                <div className="px-5 pb-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">Permissions:</span>
                    {(testResult?.ok ? testResult.permissions : conn.permissions).map((p) => (
                        <span
                            key={p}
                            className={`text-xs px-2 py-0.5 rounded-full ${
                                p === 'Withdraw'
                                    ? 'bg-red-900/30 text-red-400'
                                    : p.includes('Not Verified') || p === 'Saved'
                                      ? 'bg-yellow-900/20 text-yellow-400'
                                      : 'bg-green-900/20 text-green-400'
                            }`}
                        >
                            {p.includes('Not Verified') ? '⏳ ' : p === 'Withdraw' ? '⚠ ' : '✓ '}
                            {p}
                        </span>
                    ))}
                </div>
            )}

            {/* Action bar */}
            <div className="px-5 py-3 bg-[#18181b]/50 border-t border-gray-800 flex items-center gap-4 flex-wrap">
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
                <button
                    type="button"
                    onClick={onDelete}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400 font-medium"
                >
                    <TrashIcon className="w-4 h-4" />
                    Remove
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

            {/* Account info + balances */}
            {testResult?.ok && (testResult.balancePreview.length > 0 || testResult.accountInfo) && (
                <div className="px-5 py-3 border-t border-gray-800/50 space-y-2">
                    {testResult.accountInfo && (
                        <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
                            {testResult.accountInfo.broker && (
                                <span>
                                    Broker: <span className="text-white">{testResult.accountInfo.broker}</span>
                                </span>
                            )}
                            {testResult.accountInfo.name && (
                                <span>
                                    Name: <span className="text-white">{testResult.accountInfo.name}</span>
                                </span>
                            )}
                            {testResult.accountInfo.leverage > 0 && (
                                <span>
                                    Leverage: <span className="text-white">1:{testResult.accountInfo.leverage}</span>
                                </span>
                            )}
                        </div>
                    )}
                    {testResult.balancePreview.length > 0 && (
                        <div>
                            <p className="text-xs text-gray-500 mb-1">
                                {conn.exchange === 'mt5' ? 'Account' : 'Balances'}
                            </p>
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
            )}
        </div>
    );
};

// ════════════════════════════════════════════════════════
// Add Connection Modal (3-step wizard)
// ════════════════════════════════════════════════════════

const AddConnectionModal: React.FC<{
    onClose: () => void;
    onSaved: () => void;
}> = ({ onClose, onSaved }) => {
    const { user } = useAuth();
    const [step, setStep] = useState<'pick' | 'guide' | 'form'>('pick');
    const [exchange, setExchange] = useState<ExchangeName>('binance');
    const [nickname, setNickname] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [environment, setEnvironment] = useState<ExchangeKey['environment']>('demo');
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [oauthStatus, setOauthStatus] = useState<Record<string, boolean>>({});
    const [showManualForm, setShowManualForm] = useState(false);

    const preset = getPreset(exchange);

    useEffect(() => {
        fetch('/api/oauth/status')
            .then((r) => r.json())
            .then(setOauthStatus)
            .catch(() => {});
    }, []);

    const handlePick = (id: ExchangeName) => {
        setExchange(id);
        setNickname(`My ${getPreset(id).name}`);
        setFields({});
        setStep('guide');
    };

    const handleOAuthConnect = async () => {
        if (!user?.id) {
            setError('Please sign in first.');
            return;
        }
        setError(null);
        try {
            const params = new URLSearchParams({
                user_id: user.id,
                nickname: nickname || `My ${preset.name}`,
                environment,
            });
            const res = await fetch(`/api/oauth/${exchange}/start?${params}`);
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                setError(data.error || 'Failed to start OAuth flow');
            }
        } catch (err: any) {
            setError(err.message || 'OAuth error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        for (const field of preset.fields) {
            if (!fields[field.key]?.trim() && !preset.oauth) {
                setError(`${field.label} is required.`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await addExchangeKey({
                exchange,
                nickname,
                api_key: (fields.api_key || '').trim(),
                api_secret: (fields.api_secret || '').trim(),
                passphrase: fields.passphrase?.trim(),
                mt5_login: fields.mt5_login?.trim(),
                mt5_password: fields.mt5_password?.trim(),
                mt5_server: fields.mt5_server?.trim(),
                client_id: fields.client_id?.trim(),
                access_token: fields.access_token?.trim(),
                totp_secret: fields.totp_secret?.trim(),
                password: fields.password?.trim(),
                environment,
            });
            onSaved();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const groupedByCategory = (['crypto', 'forex', 'indian'] as ExchangeCategory[]).map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: EXCHANGES.filter((e) => e.category === cat),
    }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#202024] w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">
                        {step === 'pick'
                            ? 'Select Broker'
                            : step === 'guide'
                              ? `Set up ${preset.name}`
                              : 'Enter Credentials'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>

                {/* Step 1: Pick */}
                {step === 'pick' && (
                    <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
                        {groupedByCategory.map((group) => (
                            <div key={group.category}>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                    {group.label}
                                </h3>
                                <div className="space-y-2">
                                    {group.items.map((ex) => (
                                        <button
                                            key={ex.id}
                                            type="button"
                                            onClick={() => handlePick(ex.id)}
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
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-white font-semibold group-hover:text-blue-400 transition-colors">
                                                        {ex.name}
                                                    </p>
                                                    {ex.oauth && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400">
                                                            OAuth
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gray-500 text-sm mt-0.5">
                                                    {ex.description}
                                                </p>
                                                <div className="flex gap-1.5 mt-2 flex-wrap">
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
                            </div>
                        ))}
                    </div>
                )}

                {/* Step 2: Guide */}
                {step === 'guide' && (
                    <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                        <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4">
                            <h3 className="text-blue-300 font-semibold text-sm mb-3">
                                {preset.category === 'forex'
                                    ? `How to get your ${preset.name} credentials`
                                    : `How to create your ${preset.name} API Key`}
                            </h3>
                            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                                {preset.setupSteps.map((s, i) => (
                                    <li
                                        key={i}
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(s) }}
                                    />
                                ))}
                            </ol>
                            {preset.apiKeyGuideUrl && (
                                <a
                                    href={preset.apiKeyGuideUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-400 underline hover:text-blue-300 text-sm inline-block mt-3"
                                >
                                    Official {preset.name} docs &rarr;
                                </a>
                            )}
                        </div>

                        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3">
                            <p className="text-sm text-red-300">
                                <strong>Security:</strong>{' '}
                                {preset.category === 'forex'
                                    ? 'Use your trading password, NOT your investor (read-only) password.'
                                    : preset.category === 'indian'
                                      ? 'Your credentials are encrypted at rest. Access tokens for OAuth brokers expire daily.'
                                      : 'Never enable withdrawals. Insight only needs trading permissions.'}
                            </p>
                        </div>

                        <div className="flex justify-between pt-1">
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
                                {preset.category === 'forex'
                                    ? 'I have my credentials'
                                    : "I've created my API key"}{' '}
                                &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Form */}
                {step === 'form' && (
                    <form
                        onSubmit={handleSubmit}
                        className="p-6 space-y-4 max-h-[72vh] overflow-y-auto"
                    >
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                                {error}
                            </div>
                        )}

                        {/* OAuth shortcut — primary flow for OAuth brokers */}
                        {preset.oauth && oauthStatus[exchange] && (
                            <div
                                className="border rounded-lg p-5 space-y-4"
                                style={{
                                    backgroundColor: preset.color + '10',
                                    borderColor: preset.color + '40',
                                }}
                            >
                                <div>
                                    <h4 className="text-white font-semibold mb-1">
                                        Log in with {preset.name}
                                    </h4>
                                    <p className="text-gray-400 text-sm">
                                        You'll be redirected to {preset.name} to sign in securely.
                                        No API keys needed — just your regular {preset.name} login.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleOAuthConnect}
                                    className="w-full text-white font-semibold py-3 rounded-lg transition-opacity hover:opacity-90 text-base"
                                    style={{ backgroundColor: preset.color }}
                                >
                                    Connect with {preset.name} &rarr;
                                </button>
                            </div>
                        )}
                        {preset.oauth && !oauthStatus[exchange] && (
                            <div className="bg-yellow-600/10 border border-yellow-600/20 rounded-lg p-3">
                                <p className="text-sm text-yellow-300">
                                    <strong>{preset.name} login is not available right now.</strong>{' '}
                                    The platform admin needs to set up {preset.name} integration.
                                    Advanced users can connect manually below.
                                </p>
                            </div>
                        )}

                        {/* Manual form — shown by default for non-OAuth brokers,
                            or when user opts in for OAuth brokers */}
                        {(() => {
                            const isOauthMode = preset.oauth && oauthStatus[exchange];
                            const showManual = !isOauthMode || showManualForm;

                            if (!showManual) {
                                return (
                                    <div className="flex justify-between pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep('guide')}
                                            className="text-gray-400 hover:text-white text-sm"
                                        >
                                            &larr; Back
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowManualForm(true)}
                                            className="text-xs text-gray-500 hover:text-gray-300 underline"
                                        >
                                            Advanced: paste API keys manually
                                        </button>
                                    </div>
                                );
                            }

                            return (
                                <>
                                    {isOauthMode && showManualForm && (
                                        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-3 flex items-start justify-between gap-3">
                                            <p className="text-xs text-gray-400">
                                                <strong className="text-white">Manual setup.</strong>{' '}
                                                For developers with their own {preset.name} app. Most
                                                users should use the login button above instead.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setShowManualForm(false)}
                                                className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
                                            >
                                                Hide
                                            </button>
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
                                            aria-label="Nickname"
                                            className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                                        />
                                    </div>

                                    {/* Dynamic fields */}
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

                                    {/* Environment (only crypto + forex show demo option) */}
                                    {preset.category !== 'indian' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                                Environment
                                            </label>
                                            <div className="flex gap-2">
                                                {(['demo', 'live'] as const).map((env) => (
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
                                                        {env === 'demo' ? 'Demo (Safe)' : 'Live Trading'}
                                                    </button>
                                                ))}
                                            </div>
                                            {environment === 'live' && (
                                                <p className="text-xs text-yellow-400 mt-1.5">
                                                    Real money. Orders will execute on {preset.name}.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex justify-between pt-2">
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
                                                {isSubmitting ? 'Connecting…' : 'Connect'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </form>
                )}
            </div>
        </div>
    );
};

// ════════════════════════════════════════════════════════
// Edit Connection Modal
// ════════════════════════════════════════════════════════

const EditConnectionModal: React.FC<{
    conn: ExchangeKey;
    onClose: () => void;
    onSaved: () => void;
}> = ({ conn, onClose, onSaved }) => {
    const preset = getPreset(conn.exchange);
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
                    <h2 className="text-xl font-bold text-white">Edit {conn.nickname}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                        aria-label="Close"
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
                            aria-label="Nickname"
                            className="w-full bg-[#18181b] border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-3">
                        <p className="text-xs text-gray-500">
                            Leave blank to keep existing credentials. Fill only to rotate keys.
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
                                        placeholder="••••••••  (keep existing)"
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

                    {preset.category !== 'indian' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">
                                Environment
                            </label>
                            <div className="flex gap-2">
                                {(['demo', 'live'] as const).map((env) => (
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
                                        {env === 'demo' ? 'Demo (Safe)' : 'Live Trading'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

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

// ════════════════════════════════════════════════════════
// Delete Confirm Modal
// ════════════════════════════════════════════════════════

const DeleteConfirmModal: React.FC<{
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-[#202024] w-full max-w-sm rounded-xl border border-gray-700 shadow-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">Remove Connection</h2>
            <p className="text-gray-400 text-sm mb-6">
                Are you sure? Any strategies linked to this broker will stop executing. This
                cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-400 hover:text-white text-sm"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Remove
                </button>
            </div>
        </div>
    </div>
);

// ════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════

const BrokerConnectPage: React.FC = () => {
    const [keys, setKeys] = useState<ExchangeKey[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editConn, setEditConn] = useState<ExchangeKey | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, TestConnectionResult>>({});
    const [oauthBanner, setOauthBanner] = useState<{
        type: 'success' | 'error';
        msg: string;
    } | null>(null);
    const didHandleOauth = useRef(false);

    const loadKeys = useCallback(async () => {
        try {
            const data = await getExchangeKeys();
            setKeys(data);
        } catch (err) {
            console.error('Failed to load connections:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadKeys();
    }, [loadKeys]);

    // Handle OAuth callback redirect
    useEffect(() => {
        if (didHandleOauth.current) return;
        didHandleOauth.current = true;

        const params = new URLSearchParams(window.location.search);
        const connected = params.get('connected');
        const errorMsg = params.get('error');
        const name = params.get('name');

        if (connected) {
            setOauthBanner({
                type: 'success',
                msg: `${connected.charAt(0).toUpperCase() + connected.slice(1)} connected${name ? ` as ${name}` : ''}.`,
            });
            loadKeys();
            window.history.replaceState({}, '', window.location.pathname);
        } else if (errorMsg) {
            setOauthBanner({ type: 'error', msg: errorMsg });
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [loadKeys]);

    const handleToggle = async (key: ExchangeKey) => {
        try {
            await toggleExchangeKeyStatus(key.id, !key.is_active);
            setKeys((prev) =>
                prev.map((k) => (k.id === key.id ? { ...k, is_active: !key.is_active } : k))
            );
        } catch (err) {
            console.error(err);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteExchangeKey(deleteId);
            setKeys((prev) => prev.filter((k) => k.id !== deleteId));
        } catch (err: any) {
            alert('Failed to remove: ' + (err?.message || 'Unknown error'));
        } finally {
            setDeleteId(null);
        }
    };

    const handleTest = async (key: ExchangeKey) => {
        setTestingId(key.id);
        const result = await testExchangeConnection(key);
        setTestResults((prev) => ({ ...prev, [key.id]: result }));

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
                {/* OAuth banner */}
                {oauthBanner && (
                    <div
                        className={`mb-5 p-4 rounded-lg border flex items-start justify-between gap-3 ${
                            oauthBanner.type === 'success'
                                ? 'bg-green-600/10 border-green-600/30 text-green-300'
                                : 'bg-red-600/10 border-red-600/30 text-red-300'
                        }`}
                    >
                        <div className="text-sm">
                            {oauthBanner.type === 'success' ? '✓ ' : '✗ '}
                            {oauthBanner.msg}
                        </div>
                        <button
                            type="button"
                            onClick={() => setOauthBanner(null)}
                            className="text-gray-400 hover:text-white text-lg leading-none"
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Header */}
                <div className="flex justify-between items-start mb-8 gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">Broker Connect</h1>
                        <p className="text-gray-400 text-sm max-w-lg">
                            Connect your trading accounts to enable automated execution. Supports
                            crypto exchanges, forex brokers via MT5, and Indian stock brokers.
                        </p>
                        {keys.length > 0 && (
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                                <span>
                                    {keys.length} connection{keys.length !== 1 ? 's' : ''}
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
                        Add Broker
                    </button>
                </div>

                {/* Connection list */}
                {isLoading ? (
                    <Loader />
                ) : keys.length === 0 ? (
                    <div className="text-center py-16 bg-[#202024] rounded-xl border border-dashed border-gray-700">
                        <LinkIcon className="w-14 h-14 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400 text-lg font-medium">
                            No brokers connected yet
                        </p>
                        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                            Connect Binance, Bitget, MT5, or an Indian broker to start executing
                            trades automatically from your strategies.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="mt-5 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Connect Your First Broker
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {keys.map((key) => (
                            <ConnectionCard
                                key={key.id}
                                conn={key}
                                onToggle={() => handleToggle(key)}
                                onDelete={() => setDeleteId(key.id)}
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
                                <strong className="text-white">Pick your broker</strong> — crypto
                                exchange, MT5, or Indian broker.
                            </p>
                        </div>
                        <div>
                            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-2">
                                2
                            </div>
                            <p className="text-gray-400">
                                <strong className="text-white">Connect securely</strong> via API
                                keys or OAuth. Credentials encrypted at rest.
                            </p>
                        </div>
                        <div>
                            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold mb-2">
                                3
                            </div>
                            <p className="text-gray-400">
                                <strong className="text-white">Trades execute automatically</strong>{' '}
                                when your strategies signal.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Security notice */}
                <div className="mt-4 bg-[#202024] border border-gray-700 rounded-xl p-4 flex items-start gap-3">
                    <AlertIcon className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-400">
                        <strong className="text-white">Your keys are safe.</strong> All credentials
                        are encrypted at rest and transmitted over TLS. Insight{' '}
                        <strong>never</strong> requests withdrawal permissions. Use Demo first
                        to verify your setup.
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showAddModal && (
                <AddConnectionModal
                    onClose={() => setShowAddModal(false)}
                    onSaved={() => {
                        setShowAddModal(false);
                        loadKeys();
                    }}
                />
            )}
            {editConn && (
                <EditConnectionModal
                    conn={editConn}
                    onClose={() => setEditConn(null)}
                    onSaved={() => {
                        setEditConn(null);
                        loadKeys();
                    }}
                />
            )}
            {deleteId && (
                <DeleteConfirmModal
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteId(null)}
                />
            )}
        </div>
    );
};

export default BrokerConnectPage;
