import React, { useState } from 'react';
import { BrokerId, createBrokerCredential } from '../../../services/brokerCredentialService';

interface Props {
    broker: Extract<BrokerId, 'binance' | 'bitget'>;
    onCancel: () => void;
    onSaved: () => void;
}

const CryptoCredentialForm: React.FC<Props> = ({ broker, onCancel, onSaved }) => {
    const [nickname, setNickname] = useState('');
    const [environment, setEnvironment] = useState<'testnet' | 'mainnet'>('testnet');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);

    const canSave =
        !!nickname && !!apiKey && !!apiSecret &&
        (broker !== 'bitget' || !!passphrase) &&
        !saving;

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setFieldError(null);
        const body: Parameters<typeof createBrokerCredential>[0] = { broker, nickname, environment, apiKey, apiSecret };
        if (broker === 'bitget') body.passphrase = passphrase;
        const r = await createBrokerCredential(body);
        if ('error' in r) {
            setError(r.error);
            setFieldError(r.field ?? null);
            setSaving(false);
            return;
        }
        onSaved();
    };

    return (
        <div className="space-y-3">
            <Field label="Nickname">
                <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={broker === 'binance' ? 'My Binance Futures' : 'My Bitget'}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="Environment">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setEnvironment('testnet')}
                        className={`flex-1 py-2 rounded text-sm ${environment === 'testnet' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-300'}`}
                    >
                        Testnet
                    </button>
                    <button
                        type="button"
                        onClick={() => setEnvironment('mainnet')}
                        className={`flex-1 py-2 rounded text-sm ${environment === 'mainnet' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-300'}`}
                    >
                        Mainnet (LIVE)
                    </button>
                </div>
            </Field>
            <Field label="API Key" error={fieldError === 'apiKey' ? error ?? undefined : undefined}>
                <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="API Secret" error={fieldError === 'apiSecret' ? error ?? undefined : undefined}>
                <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
            </Field>
            {broker === 'bitget' && (
                <Field label="Passphrase" error={fieldError === 'passphrase' ? error ?? undefined : undefined}>
                    <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                </Field>
            )}
            {error && !fieldError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>
            )}
            <div className="flex gap-2 pt-2">
                <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={!canSave}
                    onClick={handleSave}
                    className={`flex-1 py-2 rounded font-semibold ${canSave ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                >
                    {saving ? 'Testing…' : 'Save & Verify'}
                </button>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
    <label className="block">
        <span className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</span>
        {children}
        {error && <span className="block text-xs text-red-400 mt-1">{error}</span>}
    </label>
);

export default CryptoCredentialForm;
