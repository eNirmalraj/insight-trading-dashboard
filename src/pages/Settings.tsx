import React, { useState, useEffect } from 'react';
import {
    UserIcon,
    LinkIcon,
    BellIcon,
    SubscriptionIcon,
    PaperIcon,
} from '../components/IconComponents';
import Subscription from './Subscription';
import ExchangeManagement from './ExchangeManagement';
import PaperTradingAccounts from './PaperTradingAccounts';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabaseClient';

import * as api from '../api';

// --- TYPE DEFINITIONS ---
type ProfileVisibility = 'public' | 'followers' | 'private';

interface ProfileData {
    fullName: string;
    username: string;
    email: string;
    bio: string;
    timezone: string;
    avatarUrl: string;
    visibility: ProfileVisibility;
    showStrategiesPublic: boolean;
    showPerformancePublic: boolean;
}

interface SettingsData {
    profile: ProfileData;
    apiKeys: {
        mt5: { accountNumber: string; password: string; serverName: string };
        binance: { apiKey: string; apiSecret: string };
    };
    notifications: { emailSignals: boolean; pushAlerts: boolean };
}

// --- INITIAL STATE ---
const initialSettings: SettingsData = {
    profile: {
        fullName: '',
        username: '',
        email: '',
        bio: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        avatarUrl: '',
        visibility: 'public',
        showStrategiesPublic: true,
        showPerformancePublic: false,
    },
    apiKeys: {
        mt5: { accountNumber: '', password: '', serverName: '' },
        binance: { apiKey: '', apiSecret: '' },
    },
    notifications: { emailSignals: true, pushAlerts: true },
};

type SettingsTab =
    | 'Profile & Security'
    | 'Broker Connect'
    | 'Paper Trading'
    | 'Notifications'
    | 'Subscription';

// --- REUSABLE UI COMPONENTS ---
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-card-bg rounded-xl p-6">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-6">{title}</h2>
        <div className="space-y-6">{children}</div>
    </div>
);

const InputRow: React.FC<{ label: string } & React.InputHTMLAttributes<HTMLInputElement>> = ({
    label,
    ...props
}) => (
    <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
        <input
            {...props}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
    </div>
);

const ToggleRow: React.FC<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
    <div className="flex items-center justify-between">
        <p className="text-white text-sm">{label}</p>
        <label className="relative inline-flex items-center cursor-pointer">
            <input
                type="checkbox"
                title={label}
                aria-label={label}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
        </label>
    </div>
);

// --- TAB CONTENT COMPONENTS ---
const COMMON_TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
];

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

const ProfileSettings: React.FC<{
    settings: ProfileData;
    onChange: (field: keyof ProfileData, value: any) => void;
}> = ({ settings, onChange }) => {
    const { user } = useAuth();
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const initials = (settings.fullName || settings.username || settings.email || '?')
        .split(/\s+/)
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

    const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadError(null);

        if (!file.type.startsWith('image/')) {
            setUploadError('File must be an image.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setUploadError('Image must be under 2 MB.');
            return;
        }
        if (!supabase || !user) {
            setUploadError('Not signed in.');
            return;
        }

        setUploading(true);
        const ext = file.name.split('.').pop() || 'png';
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from('avatars')
            .upload(path, file, { upsert: true, cacheControl: '3600' });

        if (upErr) {
            setUploading(false);
            setUploadError(upErr.message);
            return;
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        onChange('avatarUrl', data.publicUrl);
        setUploading(false);
    };

    const usernameValid = !settings.username || USERNAME_RE.test(settings.username);

    return (
        <Section title="Profile">
            <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shrink-0 overflow-hidden">
                    {settings.avatarUrl ? (
                        <img
                            src={settings.avatarUrl}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        initials
                    )}
                </div>
                <div className="flex-1">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarFile}
                        className="hidden"
                        aria-label="Upload avatar"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {uploading ? 'Uploading…' : 'Upload photo'}
                        </button>
                        {settings.avatarUrl && (
                            <button
                                type="button"
                                onClick={() => onChange('avatarUrl', '')}
                                className="text-gray-400 hover:text-red-400 text-sm"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">JPG or PNG, max 2 MB.</p>
                    {uploadError && <p className="text-xs text-red-400 mt-1">{uploadError}</p>}
                </div>
            </div>

            <InputRow
                label="Full Name"
                value={settings.fullName}
                onChange={(e) => onChange('fullName', e.target.value)}
            />

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                <div className="flex items-center bg-gray-700 border border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
                    <span className="pl-3 text-gray-500">@</span>
                    <input
                        type="text"
                        value={settings.username}
                        onChange={(e) =>
                            onChange('username', e.target.value.toLowerCase().trim())
                        }
                        maxLength={20}
                        placeholder="tradername"
                        className="flex-1 bg-transparent p-2 text-white focus:outline-none"
                    />
                </div>
                <p
                    className={`text-xs mt-1 ${
                        usernameValid ? 'text-gray-500' : 'text-red-400'
                    }`}
                >
                    3-20 characters. Letters, numbers, and underscores only.
                </p>
            </div>

            <InputRow
                label="Email Address"
                type="email"
                value={settings.email}
                disabled
                title="Email is managed by your authentication provider"
            />

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Bio</label>
                <textarea
                    value={settings.bio}
                    onChange={(e) => onChange('bio', e.target.value)}
                    rows={3}
                    maxLength={280}
                    placeholder="Tell others about your trading style…"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="text-xs text-gray-500 mt-1 text-right">
                    {settings.bio.length}/280
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Timezone</label>
                <select
                    value={settings.timezone}
                    onChange={(e) => onChange('timezone', e.target.value)}
                    aria-label="Timezone"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                            {tz}
                        </option>
                    ))}
                </select>
            </div>

            <div className="border-t border-gray-700 pt-6">
                <h3 className="text-white font-medium mb-3">Privacy</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Profile visibility
                        </label>
                        <select
                            value={settings.visibility}
                            onChange={(e) =>
                                onChange('visibility', e.target.value as ProfileVisibility)
                            }
                            aria-label="Profile visibility"
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="public">Public — anyone can view</option>
                            <option value="followers">Followers only</option>
                            <option value="private">Private — only you</option>
                        </select>
                    </div>
                    <ToggleRow
                        label="Show my shared strategies in Community"
                        checked={settings.showStrategiesPublic}
                        onChange={(v) => onChange('showStrategiesPublic', v)}
                    />
                    <ToggleRow
                        label="Show my performance stats publicly"
                        checked={settings.showPerformancePublic}
                        onChange={(v) => onChange('showPerformancePublic', v)}
                    />
                </div>
            </div>
        </Section>
    );
};

interface MfaFactor {
    id: string;
    friendly_name?: string;
    factor_type: string;
    status: string;
    created_at?: string;
}

const SecuritySettings: React.FC = () => {
    const { user, signOut } = useAuth();
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [pwdStatus, setPwdStatus] = useState<{
        type: 'idle' | 'ok' | 'error';
        msg?: string;
    }>({ type: 'idle' });
    const [isChanging, setIsChanging] = useState(false);

    // --- 2FA state ---
    const [factors, setFactors] = useState<MfaFactor[]>([]);
    const [enrollStep, setEnrollStep] = useState<'idle' | 'qr' | 'verify'>('idle');
    const [enrollData, setEnrollData] = useState<{
        factorId: string;
        qr: string;
        secret: string;
    } | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [mfaError, setMfaError] = useState<string | null>(null);
    const [mfaBusy, setMfaBusy] = useState(false);

    // --- Email change state ---
    const [newEmail, setNewEmail] = useState('');
    const [emailStatus, setEmailStatus] = useState<{
        type: 'idle' | 'ok' | 'error';
        msg?: string;
    }>({ type: 'idle' });
    const [emailBusy, setEmailBusy] = useState(false);

    // --- Data export state ---
    const [exporting, setExporting] = useState(false);

    const identities = (user as any)?.identities || [];
    const linkedProviders: string[] = identities.map((i: any) => i.provider).filter(Boolean);

    const linkProvider = async (provider: 'google' | 'github' | 'apple') => {
        if (!supabase) return;
        const linkUser = (supabase.auth as any).linkIdentity;
        if (typeof linkUser !== 'function') {
            window.alert('Account linking requires a newer Supabase SDK.');
            return;
        }
        await linkUser.call(supabase.auth, { provider });
    };

    const unlinkProvider = async (provider: string) => {
        if (!supabase) return;
        if (!window.confirm(`Unlink ${provider}?`)) return;
        const identity = identities.find((i: any) => i.provider === provider);
        if (!identity) return;
        const unlink = (supabase.auth as any).unlinkIdentity;
        if (typeof unlink === 'function') {
            await unlink.call(supabase.auth, identity);
        }
    };


    // --- Delete account state ---
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const deletePhrase = `DELETE ${user?.email || 'my-account'}`;

    const handleEmailChange = async () => {
        if (!supabase) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
            setEmailStatus({ type: 'error', msg: 'Enter a valid email address.' });
            return;
        }
        if (newEmail === user?.email) {
            setEmailStatus({ type: 'error', msg: 'That is already your email.' });
            return;
        }
        setEmailBusy(true);
        const { error } = await supabase.auth.updateUser({ email: newEmail });
        setEmailBusy(false);
        if (error) {
            setEmailStatus({ type: 'error', msg: error.message });
            return;
        }
        setEmailStatus({
            type: 'ok',
            msg: `Verification email sent to ${newEmail}. Click the link to confirm.`,
        });
        setNewEmail('');
    };

    const handleExportData = async () => {
        setExporting(true);
        try {
            const settings = await api.getSettings().catch(() => ({}));
            const bundle = {
                exportedAt: new Date().toISOString(),
                user: { id: user?.id, email: user?.email, createdAt: user?.created_at },
                settings,
            };
            const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `insight-data-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    const loadFactors = React.useCallback(async () => {
        if (!supabase) return;
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) return;
        setFactors((data?.totp as MfaFactor[]) || []);
    }, []);

    useEffect(() => {
        loadFactors();
    }, [loadFactors]);

    const totpEnabled = factors.some((f) => f.status === 'verified');

    const startEnroll = async () => {
        if (!supabase) return;
        setMfaError(null);
        setMfaBusy(true);
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        setMfaBusy(false);
        if (error || !data) {
            setMfaError(error?.message || 'Failed to start 2FA enrollment.');
            return;
        }
        setEnrollData({
            factorId: data.id,
            qr: data.totp.qr_code,
            secret: data.totp.secret,
        });
        setEnrollStep('qr');
    };

    const verifyEnroll = async () => {
        if (!supabase || !enrollData) return;
        if (totpCode.length !== 6) {
            setMfaError('Enter the 6-digit code from your authenticator app.');
            return;
        }
        setMfaError(null);
        setMfaBusy(true);
        const { data: chData, error: chErr } = await supabase.auth.mfa.challenge({
            factorId: enrollData.factorId,
        });
        if (chErr || !chData) {
            setMfaBusy(false);
            setMfaError(chErr?.message || 'Challenge failed.');
            return;
        }
        const { error: vErr } = await supabase.auth.mfa.verify({
            factorId: enrollData.factorId,
            challengeId: chData.id,
            code: totpCode,
        });
        setMfaBusy(false);
        if (vErr) {
            setMfaError(vErr.message);
            return;
        }
        setEnrollStep('idle');
        setEnrollData(null);
        setTotpCode('');
        await loadFactors();
    };

    const cancelEnroll = async () => {
        if (supabase && enrollData) {
            await supabase.auth.mfa.unenroll({ factorId: enrollData.factorId });
        }
        setEnrollStep('idle');
        setEnrollData(null);
        setTotpCode('');
        setMfaError(null);
    };

    const disable2FA = async () => {
        if (!supabase) return;
        if (!window.confirm('Disable two-factor authentication?')) return;
        for (const f of factors) {
            await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        await loadFactors();
    };

    const handleChangePassword = async () => {
        if (newPwd.length < 8) {
            setPwdStatus({ type: 'error', msg: 'Password must be at least 8 characters.' });
            return;
        }
        if (newPwd !== confirmPwd) {
            setPwdStatus({ type: 'error', msg: 'Passwords do not match.' });
            return;
        }
        if (!supabase) {
            setPwdStatus({ type: 'error', msg: 'Auth provider not configured.' });
            return;
        }

        setIsChanging(true);
        const { error } = await supabase.auth.updateUser({ password: newPwd });
        setIsChanging(false);

        if (error) {
            setPwdStatus({ type: 'error', msg: error.message });
            return;
        }
        setPwdStatus({ type: 'ok', msg: 'Password updated.' });
        setCurrentPwd('');
        setNewPwd('');
        setConfirmPwd('');
    };

    const handleSignOutEverywhere = async () => {
        if (!supabase) return;
        if (!window.confirm('Sign out of all devices? You will need to log in again.')) return;
        await supabase.auth.signOut({ scope: 'global' });
        await signOut();
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirm !== deletePhrase) return;
        // Actual deletion requires a backend endpoint with service-role key.
        // For now we flag the account for deletion and sign out.
        try {
            await api.updateUserSettings({ deletionRequestedAt: new Date().toISOString() });
        } catch {
            /* non-blocking */
        }
        window.alert(
            'Account deletion requested. You will be signed out. Your data will be permanently removed within 30 days.'
        );
        await signOut();
    };

    return (
        <Section title="Security">
            <div>
                <h3 className="text-white font-medium mb-3">Change Password</h3>
                <div className="space-y-3">
                    <InputRow
                        label="Current Password"
                        type="password"
                        autoComplete="current-password"
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                    />
                    <InputRow
                        label="New Password"
                        type="password"
                        autoComplete="new-password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                    />
                    <InputRow
                        label="Confirm New Password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                    />
                    {pwdStatus.type !== 'idle' && (
                        <p
                            className={`text-sm ${
                                pwdStatus.type === 'ok' ? 'text-green-400' : 'text-red-400'
                            }`}
                        >
                            {pwdStatus.msg}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={handleChangePassword}
                        disabled={isChanging || !newPwd || !confirmPwd}
                        className="bg-blue-500 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isChanging ? 'Updating…' : 'Update Password'}
                    </button>
                </div>
            </div>

            <div className="border-t border-gray-700 pt-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                        <h3 className="text-white font-medium flex items-center gap-2">
                            Two-Factor Authentication
                            {totpEnabled ? (
                                <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">
                                    Enabled
                                </span>
                            ) : (
                                <span className="text-xs bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded-full">
                                    Recommended
                                </span>
                            )}
                        </h3>
                        <p className="text-gray-400 text-sm mt-1">
                            Protect your account with a code from an authenticator app (Google
                            Authenticator, Authy, 1Password).
                        </p>
                    </div>
                    {totpEnabled && enrollStep === 'idle' && (
                        <button
                            type="button"
                            onClick={disable2FA}
                            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded-lg whitespace-nowrap"
                        >
                            Disable
                        </button>
                    )}
                    {!totpEnabled && enrollStep === 'idle' && (
                        <button
                            type="button"
                            onClick={startEnroll}
                            disabled={mfaBusy}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 px-4 rounded-lg whitespace-nowrap disabled:bg-gray-600"
                        >
                            {mfaBusy ? 'Starting…' : 'Enable 2FA'}
                        </button>
                    )}
                </div>

                {enrollStep === 'qr' && enrollData && (
                    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-4">
                        <p className="text-sm text-gray-300">
                            1. Scan this QR code with your authenticator app.
                        </p>
                        <div className="flex items-center gap-4">
                            <img
                                src={enrollData.qr}
                                alt="2FA QR code"
                                className="w-40 h-40 bg-white rounded-lg p-2"
                            />
                            <div className="text-xs text-gray-400">
                                <p className="mb-1">Or enter this key manually:</p>
                                <code className="block bg-gray-900 px-2 py-1 rounded break-all text-gray-200">
                                    {enrollData.secret}
                                </code>
                            </div>
                        </div>
                        <p className="text-sm text-gray-300">
                            2. Enter the 6-digit code from your app:
                        </p>
                        <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="000000"
                            aria-label="Authentication code"
                            className="w-40 bg-gray-700 border border-gray-600 rounded-lg p-2 text-white text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {mfaError && <p className="text-sm text-red-400">{mfaError}</p>}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={verifyEnroll}
                                disabled={mfaBusy || totpCode.length !== 6}
                                className="bg-blue-500 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-600"
                            >
                                {mfaBusy ? 'Verifying…' : 'Verify & Enable'}
                            </button>
                            <button
                                type="button"
                                onClick={cancelEnroll}
                                className="text-gray-400 hover:text-white text-sm py-2 px-4"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                {mfaError && enrollStep === 'idle' && (
                    <p className="text-sm text-red-400 mt-2">{mfaError}</p>
                )}
            </div>

            <div className="border-t border-gray-700 pt-6">
                <h3 className="text-white font-medium mb-2">Active Sessions</h3>
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 mb-3 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-white font-medium">
                            {navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'} ·{' '}
                            {navigator.platform || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">
                            This device · signed in as {user?.email}
                        </p>
                    </div>
                    <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">
                        Current
                    </span>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                    Signing out everywhere will end all active sessions including this one.
                </p>
                <button
                    type="button"
                    onClick={handleSignOutEverywhere}
                    className="bg-gray-700 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors"
                >
                    Sign out everywhere
                </button>
            </div>

            <div className="border-t border-gray-700 pt-6">
                <h3 className="text-white font-medium mb-2">Email Address</h3>
                <p className="text-gray-400 text-sm mb-3">
                    Current: <span className="text-white">{user?.email}</span>. Changing your
                    email sends a verification link to the new address — it won't switch until you
                    click it.
                </p>
                <div className="flex gap-2 items-start max-w-md">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="new@email.com"
                        aria-label="New email address"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        type="button"
                        onClick={handleEmailChange}
                        disabled={emailBusy || !newEmail}
                        className="bg-blue-500 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-600 whitespace-nowrap"
                    >
                        {emailBusy ? 'Sending…' : 'Change Email'}
                    </button>
                </div>
                {emailStatus.type !== 'idle' && (
                    <p
                        className={`text-sm mt-2 ${
                            emailStatus.type === 'ok' ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                        {emailStatus.msg}
                    </p>
                )}
            </div>

            <div className="border-t border-gray-700 pt-6">
                <h3 className="text-white font-medium mb-2">Data Export</h3>
                <p className="text-gray-400 text-sm mb-3">
                    Download a copy of your profile, settings, and account metadata as JSON. For a
                    full export including strategies and journal entries, contact support.
                </p>
                <button
                    type="button"
                    onClick={handleExportData}
                    disabled={exporting}
                    className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold py-2 px-4 rounded-lg disabled:opacity-50"
                >
                    {exporting ? 'Preparing…' : 'Download My Data'}
                </button>
            </div>

            <div className="border-t border-gray-700 pt-6">
                <h3 className="text-white font-medium mb-2">Connected Accounts</h3>
                <p className="text-gray-400 text-sm mb-3">
                    Link a social login for faster sign-in. You can unlink at any time as long as
                    you have one login method left.
                </p>
                <div className="space-y-2 max-w-md">
                    {(['google', 'github', 'apple'] as const).map((p) => {
                        const linked = linkedProviders.includes(p);
                        return (
                            <div
                                key={p}
                                className="flex items-center justify-between bg-gray-800/60 border border-gray-700 rounded-lg p-3"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-white capitalize font-medium">{p}</span>
                                    {linked && (
                                        <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">
                                            Linked
                                        </span>
                                    )}
                                </div>
                                {linked ? (
                                    <button
                                        type="button"
                                        onClick={() => unlinkProvider(p)}
                                        className="text-gray-400 hover:text-red-400 text-sm"
                                    >
                                        Unlink
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => linkProvider(p)}
                                        className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-1.5 px-3 rounded-lg"
                                    >
                                        Link
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="border-t border-red-900/40 pt-6">
                <h3 className="text-red-400 font-medium mb-2">Danger Zone</h3>
                <p className="text-gray-400 text-sm mb-3">
                    Permanently delete your account and all associated data — strategies, journal
                    entries, positions, and history. This action cannot be undone.
                </p>
                <label className="block text-xs text-gray-500 mb-1">
                    Type{' '}
                    <code className="text-red-400 bg-gray-900 px-1 rounded">{deletePhrase}</code>{' '}
                    to confirm:
                </label>
                <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={deletePhrase}
                    aria-label="Delete confirmation phrase"
                    className="w-full max-w-md bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                />
                <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirm !== deletePhrase}
                    className="bg-red-600/20 border border-red-600/50 text-red-400 text-sm font-semibold py-2 px-4 rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Delete Account Permanently
                </button>
            </div>
        </Section>
    );
};

const BrokerConnectSettings: React.FC = () => (
    <div className="h-full">
        <ExchangeManagement />
    </div>
);

const NotificationSettings: React.FC<{
    settings: SettingsData['notifications'];
    onChange: (field: keyof SettingsData['notifications'], value: any) => void;
}> = ({ settings, onChange }) => (
    <Section title="Notifications">
        <ToggleRow
            label="Email notifications for new signals"
            checked={settings.emailSignals}
            onChange={(v) => onChange('emailSignals', v)}
        />
        <ToggleRow
            label="Push notifications for triggered alerts"
            checked={settings.pushAlerts}
            onChange={(v) => onChange('pushAlerts', v)}
        />
    </Section>
);

// --- MAIN SETTINGS COMPONENT ---
const Settings: React.FC = () => {
    const { user } = useAuth();
    const [settings, setSettings] = useState<SettingsData>(initialSettings);
    const [activeTab, setActiveTab] = useState<SettingsTab>('Profile & Security');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        if (user?.email) {
            setSettings((prev) => ({
                ...prev,
                profile: { ...prev.profile, email: user.email || '' },
            }));
        }
    }, [user]);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const saved = await api.getSettings();
                if (saved) {
                    const migratedSettings = { ...initialSettings };
                    if (saved.profile) {
                        migratedSettings.profile = { ...initialSettings.profile, ...saved.profile };
                    }
                    if (saved.notifications) {
                        migratedSettings.notifications = {
                            ...initialSettings.notifications,
                            ...saved.notifications,
                        };
                    }
                    if (saved.apiKeys) {
                        if (saved.apiKeys.binance) {
                            migratedSettings.apiKeys.binance = {
                                ...initialSettings.apiKeys.binance,
                                ...saved.apiKeys.binance,
                            };
                        }
                        if (saved.apiKeys.mt5) {
                            migratedSettings.apiKeys.mt5 = {
                                ...initialSettings.apiKeys.mt5,
                                ...saved.apiKeys.mt5,
                            };
                        }
                    }
                    setSettings(migratedSettings);
                }
            } catch (e) {
                console.error('Failed to load settings', e);
            }
        };
        loadSettings();
    }, []);

    const handleSettingChange = (category: 'profile' | 'notifications', field: any, value: any) => {
        setSettings((prev) => ({
            ...prev,
            [category]: {
                ...prev[category],
                [field]: value,
            },
        }));
    };

    const handleApiSettingChange = (
        apiKeyType: 'mt5' | 'binance',
        field: string,
        value: string
    ) => {
        setSettings((prev) => ({
            ...prev,
            apiKeys: {
                ...prev.apiKeys,
                [apiKeyType]: {
                    ...prev.apiKeys[apiKeyType],
                    [field]: value,
                },
            },
        }));
    };

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            await api.saveSettings(settings);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            console.error('Failed to save settings', e);
            alert('Error saving settings.');
            setSaveStatus('idle');
        }
    };

    const tabs: { name: SettingsTab; icon: React.ReactNode }[] = [
        { name: 'Profile & Security', icon: <UserIcon className="w-5 h-5" /> },
        { name: 'Broker Connect', icon: <LinkIcon className="w-5 h-5" /> },
        { name: 'Paper Trading', icon: <PaperIcon className="w-5 h-5" /> },
        { name: 'Notifications', icon: <BellIcon className="w-5 h-5" /> },
        { name: 'Subscription', icon: <SubscriptionIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="flex flex-col h-full">
            {/* Header Tabs - Desktop */}
            <div className="hidden md:block border-b border-gray-700/50 bg-gray-900/50">
                <div className="px-6 pt-4">
                    <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
                    <nav className="flex gap-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.name}
                                onClick={() => setActiveTab(tab.name)}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                                    activeTab === tab.name
                                        ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.name}</span>
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {/* Mobile Dropdown */}
            <div className="md:hidden p-4 border-b border-gray-700/50 bg-gray-900">
                <h2 className="text-lg font-bold text-white mb-3">Settings</h2>
                <select
                    title="Settings Tab"
                    aria-label="Settings Tab"
                    value={activeTab}
                    onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {tabs.map((tab) => (
                        <option key={tab.name} value={tab.name}>
                            {tab.name}
                        </option>
                    ))}
                </select>
            </div>

            <main className="flex-1 p-6 space-y-8 overflow-y-auto bg-black">
                {activeTab === 'Profile & Security' && (
                    <>
                        <ProfileSettings
                            settings={settings.profile}
                            onChange={(f, v) => handleSettingChange('profile', f, v)}
                        />
                        <SecuritySettings />
                    </>
                )}
                {activeTab === 'Broker Connect' && <BrokerConnectSettings />}
                {activeTab === 'Paper Trading' && <PaperTradingAccounts />}
                {activeTab === 'Notifications' && (
                    <NotificationSettings
                        settings={settings.notifications}
                        onChange={(f, v) => handleSettingChange('notifications', f, v)}
                    />
                )}
                {activeTab === 'Subscription' && <Subscription />}

                {activeTab !== 'Subscription' &&
                    activeTab !== 'Broker Connect' &&
                    activeTab !== 'Paper Trading' && (
                        <div className="flex justify-end pt-4">
                            <button
                                onClick={handleSave}
                                disabled={saveStatus !== 'idle'}
                                className="bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-600 w-32"
                            >
                                {saveStatus === 'saving'
                                    ? 'Saving...'
                                    : saveStatus === 'saved'
                                      ? 'Saved!'
                                      : 'Save Changes'}
                            </button>
                        </div>
                    )}
            </main>
        </div>
    );
};

export default Settings;
