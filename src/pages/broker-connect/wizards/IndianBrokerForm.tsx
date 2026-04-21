import React, { useEffect, useState } from 'react';
import { BrokerId, createBrokerCredential, startOAuth, completeOAuth } from '../../../services/brokerCredentialService';
import { BROKERS } from '../brokerMeta';

type IndianId = Extract<BrokerId, 'zerodha' | 'angelone' | 'upstox' | 'dhan' | 'fyers'>;
type OauthId = Extract<IndianId, 'zerodha' | 'upstox' | 'fyers'>;

interface Props {
    broker: IndianId;
    onCancel: () => void;
    onSaved: () => void;
}

const IndianBrokerForm: React.FC<Props> = ({ broker, onCancel, onSaved }) => {
    const meta = BROKERS[broker];
    const isOauth = meta.authMethod === 'oauth';

    const [nickname, setNickname] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [clientId, setClientId] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [totpSecret, setTotp] = useState('');
    const [mpin, setMpin] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // If the user returned from an OAuth redirect, the URL will have ?code=&state=.
    // Complete the exchange on mount for OAuth brokers.
    useEffect(() => {
        if (!isOauth) return;
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        if (!code || !state) return;
        void (async () => {
            const r = await completeOAuth(broker as OauthId, code, state);
            if ('error' in r) setError(r.error);
            else onSaved();
        })();
    }, [broker, isOauth, onSaved]);

    const handleOauthStart = async () => {
        setSaving(true);
        setError(null);
        const r = await startOAuth(broker as OauthId, nickname, apiKey, apiSecret);
        if ('error' in r) {
            setError(r.error);
            setSaving(false);
            return;
        }
        window.location.href = r.authorizeUrl;
    };

    const handleDirectSave = async () => {
        setSaving(true);
        setError(null);
        const body: Parameters<typeof createBrokerCredential>[0] = { broker, nickname, environment: 'live', apiKey };
        if (broker === 'angelone') {
            body.clientId = clientId;
            body.totpSecret = totpSecret;
            body.passphrase = mpin;   // Angel One MPIN
        } else if (broker === 'dhan') {
            body.clientId = clientId;
            body.accessToken = accessToken;
        }
        const r = await createBrokerCredential(body);
        if ('error' in r) {
            setError(r.error);
            setSaving(false);
            return;
        }
        onSaved();
    };

    if (isOauth) {
        return (
            <div className="space-y-3">
                <Field label="Nickname">
                    <input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                </Field>
                <Field label={`${meta.name} API Key`}>
                    <input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                </Field>
                <Field label={`${meta.name} API Secret`}>
                    <input
                        type="password"
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                </Field>
                {error && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>
                )}
                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!nickname || !apiKey || !apiSecret || saving}
                        onClick={handleOauthStart}
                        className={`flex-1 py-2 rounded font-semibold ${nickname && apiKey && apiSecret && !saving ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                    >
                        Connect with {meta.name}
                    </button>
                </div>
            </div>
        );
    }

    // Angel One / Dhan — direct API keys
    return (
        <div className="space-y-3">
            <Field label="Nickname">
                <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="API Key">
                <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="Client ID">
                <input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
            </Field>
            {broker === 'angelone' && (
                <Field label="TOTP Secret" hint="Scan QR in Angel One app settings to reveal">
                    <input
                        type="password"
                        value={totpSecret}
                        onChange={(e) => setTotp(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                </Field>
            )}
            {broker === 'angelone' && (
                <Field label="MPIN">
                    <input
                        type="password"
                        value={mpin}
                        onChange={(e) => setMpin(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                </Field>
            )}
            {broker === 'dhan' && (
                <Field label="Access Token">
                    <input
                        type="password"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                </Field>
            )}
            {error && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>
            )}
            <div className="flex gap-2 pt-2">
                <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={saving || !nickname || !apiKey || !clientId}
                    onClick={handleDirectSave}
                    className={`flex-1 py-2 rounded font-semibold ${!saving && nickname && apiKey && clientId ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                >
                    {saving ? 'Verifying…' : 'Save & Verify'}
                </button>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</span>
        {children}
        {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
);

export default IndianBrokerForm;
