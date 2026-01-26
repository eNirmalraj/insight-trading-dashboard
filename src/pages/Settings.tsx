
import React, { useState, useEffect } from 'react';
import { UserIcon, LinkIcon, BellIcon, SubscriptionIcon } from '../components/IconComponents';
import Subscription from './Subscription';
import ExchangeManagement from './ExchangeManagement';

import * as api from '../api';

// --- TYPE DEFINITIONS ---
interface SettingsData {
    profile: { fullName: string; email: string; };
    apiKeys: {
        mt5: { accountNumber: string; password: string; serverName: string; };
        binance: { apiKey: string; apiSecret: string; };
    };
    notifications: { emailSignals: boolean; pushAlerts: boolean; };
}

// --- INITIAL STATE ---
const initialSettings: SettingsData = {
    profile: { fullName: 'John Doe', email: 'john.doe@example.com' },
    apiKeys: {
        mt5: { accountNumber: '', password: '', serverName: '' },
        binance: { apiKey: '', apiSecret: '' }
    },
    notifications: { emailSignals: true, pushAlerts: true },
};

type SettingsTab = 'Profile & Security' | 'Broker Connect' | 'Notifications' | 'Subscription';

// --- REUSABLE UI COMPONENTS ---
const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-card-bg rounded-xl p-6">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-6">{title}</h2>
        <div className="space-y-6">{children}</div>
    </div>
);

const InputRow: React.FC<{ label: string } & React.InputHTMLAttributes<HTMLInputElement>> = ({ label, ...props }) => (
    <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
        <input {...props} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
);

const ToggleRow: React.FC<{ label: string, checked: boolean, onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
    <div className="flex items-center justify-between">
        <p className="text-white text-sm">{label}</p>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
        </label>
    </div>
);

// --- TAB CONTENT COMPONENTS ---
const ProfileSettings: React.FC<{ settings: SettingsData['profile']; onChange: (field: keyof SettingsData['profile'], value: any) => void }> = ({ settings, onChange }) => (
    <Section title="Profile & Security">
        <InputRow label="Full Name" value={settings.fullName} onChange={e => onChange('fullName', e.target.value)} />
        <InputRow label="Email Address" type="email" value={settings.email} onChange={e => onChange('email', e.target.value)} />

    </Section>
);

const BrokerConnectSettings: React.FC = () => (
    <div className="h-full">
        <ExchangeManagement />
    </div>
);

const NotificationSettings: React.FC<{ settings: SettingsData['notifications']; onChange: (field: keyof SettingsData['notifications'], value: any) => void }> = ({ settings, onChange }) => (
    <Section title="Notifications">
        <ToggleRow label="Email notifications for new signals" checked={settings.emailSignals} onChange={v => onChange('emailSignals', v)} />
        <ToggleRow label="Push notifications for triggered alerts" checked={settings.pushAlerts} onChange={v => onChange('pushAlerts', v)} />
    </Section>
);

// --- MAIN SETTINGS COMPONENT ---
const Settings: React.FC = () => {
    const [settings, setSettings] = useState<SettingsData>(initialSettings);
    const [activeTab, setActiveTab] = useState<SettingsTab>('Broker Connect');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

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
                        migratedSettings.notifications = { ...initialSettings.notifications, ...saved.notifications };
                    }
                    if (saved.apiKeys) {
                        if (saved.apiKeys.binance) {
                            migratedSettings.apiKeys.binance = { ...initialSettings.apiKeys.binance, ...saved.apiKeys.binance };
                        }
                        if (saved.apiKeys.mt5) {
                            migratedSettings.apiKeys.mt5 = { ...initialSettings.apiKeys.mt5, ...saved.apiKeys.mt5 };
                        }
                    }
                    setSettings(migratedSettings);
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            }
        };
        loadSettings();
    }, []);

    const handleSettingChange = (category: 'profile' | 'notifications', field: any, value: any) => {
        setSettings(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [field]: value
            }
        }));
    };

    const handleApiSettingChange = (apiKeyType: 'mt5' | 'binance', field: string, value: string) => {
        setSettings(prev => ({
            ...prev,
            apiKeys: {
                ...prev.apiKeys,
                [apiKeyType]: {
                    ...prev.apiKeys[apiKeyType],
                    [field]: value
                }
            }
        }));
    };

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            await api.saveSettings(settings);
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (e) {
            console.error("Failed to save settings", e);
            alert("Error saving settings.");
            setSaveStatus('idle');
        }
    };

    const tabs: { name: SettingsTab; icon: React.ReactNode }[] = [
        { name: 'Profile & Security', icon: <UserIcon className="w-5 h-5" /> },
        { name: 'Broker Connect', icon: <LinkIcon className="w-5 h-5" /> },
        { name: 'Notifications', icon: <BellIcon className="w-5 h-5" /> },
        { name: 'Subscription', icon: <SubscriptionIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="flex flex-col md:flex-row h-full">
            {/* Desktop Sidebar */}
            <aside className="hidden md:block w-full md:w-64 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-700/50 p-3 flex-shrink-0">
                <nav className="space-y-4">
                    <div>
                        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User Settings</h3>
                        <div className="mt-2 space-y-1">
                            {tabs.map(tab => (
                                <TabButton key={tab.name} {...tab} isActive={activeTab === tab.name} onClick={() => setActiveTab(tab.name)} />
                            ))}
                        </div>
                    </div>
                </nav>
            </aside>

            {/* Mobile Dropdown */}
            <div className="md:hidden p-4 border-b border-gray-700/50">
                <select
                    value={activeTab}
                    onChange={(e) => setActiveTab(e.target.value as SettingsTab)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    {tabs.map(tab => <option key={tab.name} value={tab.name}>{tab.name}</option>)}
                </select>
            </div>

            <main className="flex-1 p-6 space-y-8 overflow-y-auto">
                {activeTab === 'Profile & Security' && <ProfileSettings settings={settings.profile} onChange={(f, v) => handleSettingChange('profile', f, v)} />}
                {activeTab === 'Broker Connect' && <BrokerConnectSettings />}
                {activeTab === 'Notifications' && <NotificationSettings settings={settings.notifications} onChange={(f, v) => handleSettingChange('notifications', f, v)} />}
                {activeTab === 'Subscription' && <Subscription />}

                {activeTab !== 'Subscription' && (
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleSave}
                            disabled={saveStatus !== 'idle'}
                            className="bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-600 w-32"
                        >
                            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
};

const TabButton: React.FC<{ name: string; icon: React.ReactNode; isActive: boolean; onClick: () => void; }> = ({ name, icon, isActive, onClick }) => (
    <button onClick={onClick} className={`flex items-center w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
        {icon}
        <span className="ml-3">{name}</span>
    </button>
);

export default Settings;
