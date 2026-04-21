import React, { useState } from 'react';
import { createBrokerCredential } from '../../../services/brokerCredentialService';

interface Props {
    onCancel: () => void;
    onSaved: () => void;
}

const MT5CredentialForm: React.FC<Props> = ({ onCancel, onSaved }) => {
    const [nickname, setNickname] = useState('');
    const [environment, setEnvironment] = useState<'demo' | 'live'>('demo');
    const [mt5Login, setLogin] = useState('');
    const [mt5Password, setPassword] = useState('');
    const [mt5Server, setServer] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSave = !!nickname && !!mt5Login && !!mt5Password && !!mt5Server && !saving;

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        const r = await createBrokerCredential({
            broker: 'mt5', nickname, environment, mt5Login, mt5Password, mt5Server,
        });
        if ('error' in r) {
            setError(r.error);
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
                    placeholder="My MT5 Demo"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="Environment">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setEnvironment('demo')}
                        className={`flex-1 py-2 rounded text-sm ${environment === 'demo' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-300'}`}
                    >
                        Demo
                    </button>
                    <button
                        type="button"
                        onClick={() => setEnvironment('live')}
                        className={`flex-1 py-2 rounded text-sm ${environment === 'live' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-300'}`}
                    >
                        Live
                    </button>
                </div>
            </Field>
            <Field label="Account Login">
                <input
                    value={mt5Login}
                    onChange={(e) => setLogin(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="Password">
                <input
                    type="password"
                    value={mt5Password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                />
            </Field>
            <Field label="Server" hint="e.g. ICMarkets-Demo, Pepperstone-Live">
                <input
                    value={mt5Server}
                    onChange={(e) => setServer(e.target.value)}
                    placeholder="ICMarkets-Demo"
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
                    disabled={!canSave}
                    onClick={handleSave}
                    className={`flex-1 py-2 rounded font-semibold ${canSave ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                >
                    {saving ? 'Connecting…' : 'Save & Verify'}
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

export default MT5CredentialForm;
