import React, { useState, useRef, useEffect } from 'react';
import { ChartSettings, SymbolSettings, CanvasSettings, ScalesAndLinesSettings, StatusLineSettings } from './types';
import { CloseIcon, SymbolIcon, StatusLineIcon, ScalesAndLinesIcon, CanvasIcon } from '../IconComponents';
import { useOutsideAlerter } from './hooks';
import { ColorPicker } from './ColorPicker';


interface ChartSettingsModalProps {
    settings: ChartSettings;
    onClose: () => void;
    onSave: (newSettings: ChartSettings) => void;
}

type SettingsTab = 'Symbol' | 'Status line' | 'Scales and lines' | 'Canvas';

const TabButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${isActive ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
    >
        {icon}
        <span className="ml-3">{label}</span>
    </button>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{children}</h3>
);

const ColorSettingRow: React.FC<{
    label: string;
    isChecked: boolean;
    onToggle: (checked: boolean) => void;
    upColor: string;
    onUpColorChange: (color: string) => void;
    downColor: string;
    onDownColorChange: (color: string) => void;
}> = ({ label, isChecked, onToggle, upColor, onUpColorChange, downColor, onDownColorChange }) => (
    <div className="flex items-center justify-between">
        <div className="flex items-center">
            <input
                type="checkbox"
                checked={isChecked}
                onChange={e => onToggle(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-1"
            />
            <span className="ml-3 text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-1">
            <ColorPicker color={upColor} onChange={onUpColorChange} />
            <ColorPicker color={downColor} onChange={onDownColorChange} />
        </div>
    </div>
);

const CheckboxSettingRow: React.FC<{
    label: string;
    isChecked: boolean;
    onToggle: (checked: boolean) => void;
}> = ({ label, isChecked, onToggle }) => (
    <div className="flex items-center justify-between py-1">
        <span className="text-gray-300">{label}</span>
        <input
            type="checkbox"
            checked={isChecked}
            onChange={e => onToggle(e.target.checked)}
            className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-1"
        />
    </div>
);

const RadioButtonGroup: React.FC<{
    options: { label: string; value: string }[];
    selectedValue: string;
    onChange: (value: string) => void;
}> = ({ options, selectedValue, onChange }) => (
    <div className="flex items-center bg-gray-700/50 p-1 rounded-lg">
        {options.map(option => (
            <button
                key={option.value}
                onClick={() => onChange(option.value)}
                className={`flex-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${selectedValue === option.value ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-600'
                    }`}
            >
                {option.label}
            </button>
        ))}
    </div>
);

const ColorRow: React.FC<{ label: string, color: string, onChange: (color: string) => void }> = ({ label, color, onChange }) => (
    <div className="flex items-center justify-between">
        <p className="text-gray-300">{label}</p>
        <ColorPicker color={color} onChange={onChange} />
    </div>
);

const TextSettingRow: React.FC<{ label: string, value: string, onChange: (value: string) => void, placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
    <div className="flex items-center justify-between">
        <label className="text-gray-300">{label}</label>
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-1/2 bg-gray-700 border border-gray-600 rounded-md py-1 px-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
    </div>
);

const ToggleableColorRow: React.FC<{
    label: string;
    isChecked: boolean;
    onToggle: (checked: boolean) => void;
    color: string;
    onColorChange: (color: string) => void;
}> = ({ label, isChecked, onToggle, color, onColorChange }) => (
    <div className="flex items-center justify-between">
        <div className="flex items-center">
            <input
                type="checkbox"
                checked={isChecked}
                onChange={e => onToggle(e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-1"
            />
            <span className="ml-3 text-gray-300">{label}</span>
        </div>
        {isChecked && (
            <ColorPicker color={color} onChange={onColorChange} />
        )}
    </div>
);

const SelectSettingRow: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
    <div className="flex items-center justify-between">
        <span className="text-gray-300">{label}</span>
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
            {children}
        </select>
    </div>
);

const SymbolSettingsComponent: React.FC<{
    settings: SymbolSettings;
    onChange: <K extends keyof SymbolSettings>(key: K, value: SymbolSettings[K]) => void;
}> = ({ settings, onChange }) => (
    <div className="space-y-6">
        <div>
            <SectionTitle>Candles</SectionTitle>
            <div className="space-y-4">
                <CheckboxSettingRow
                    label="Color bars based on previous close"
                    isChecked={settings.colorBarsOnPrevClose}
                    onToggle={checked => onChange('colorBarsOnPrevClose', checked)}
                />
                <ColorSettingRow
                    label="Body"
                    isChecked={settings.showBody}
                    onToggle={checked => onChange('showBody', checked)}
                    upColor={settings.bodyUpColor}
                    onUpColorChange={color => onChange('bodyUpColor', color)}
                    downColor={settings.bodyDownColor}
                    onDownColorChange={color => onChange('bodyDownColor', color)}
                />
                <ColorSettingRow
                    label="Borders"
                    isChecked={settings.showBorders}
                    onToggle={checked => onChange('showBorders', checked)}
                    upColor={settings.borderUpColor}
                    onUpColorChange={color => onChange('borderUpColor', color)}
                    downColor={settings.borderDownColor}
                    onDownColorChange={color => onChange('borderDownColor', color)}
                />
                <ColorSettingRow
                    label="Wick"
                    isChecked={settings.showWick}
                    onToggle={checked => onChange('showWick', checked)}
                    upColor={settings.wickUpColor}
                    onUpColorChange={color => onChange('wickUpColor', color)}
                    downColor={settings.wickDownColor}
                    onDownColorChange={color => onChange('wickDownColor', color)}
                />
            </div>
        </div>
        <div>
            <SectionTitle>Data Modification</SectionTitle>
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label htmlFor="precision" className="text-gray-300">Precision</label>
                    <select id="precision" value={settings.precision} onChange={e => onChange('precision', e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option>Default</option>
                        <option>1/10</option>
                        <option>1/100</option>
                    </select>
                </div>
                <div className="flex items-center justify-between">
                    <label htmlFor="timezone" className="text-gray-300">Timezone</label>
                    <select id="timezone" value={settings.timezone} onChange={e => onChange('timezone', e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="Etc/UTC">UTC</option>
                        <option value="America/New_York">(UTC-4) New York</option>
                        <option value="Europe/London">(UTC+1) London</option>
                        <option value="Asia/Kolkata">(UTC+5:30) Kolkata</option>
                        <option value="Asia/Tokyo">(UTC+9) Tokyo</option>
                    </select>
                </div>
            </div>
        </div>
    </div>
);

const StatusLineSettingsComponent: React.FC<{
    settings: StatusLineSettings;
    onChange: <K extends keyof StatusLineSettings>(key: K, value: StatusLineSettings[K]) => void;
}> = ({ settings, onChange }) => (
    <div className="space-y-4">
        <CheckboxSettingRow
            label="Title"
            isChecked={settings.showIndicatorTitles}
            onToggle={checked => onChange('showIndicatorTitles', checked)}
        />
        <CheckboxSettingRow
            label="OHLC values"
            isChecked={settings.showOhlc}
            onToggle={checked => onChange('showOhlc', checked)}
        />
        <CheckboxSettingRow
            label="Bar change values"
            isChecked={settings.showBarChange}
            onToggle={checked => onChange('showBarChange', checked)}
        />
        <CheckboxSettingRow
            label="Volume"
            isChecked={settings.showVolume}
            onToggle={checked => onChange('showVolume', checked)}
        />
    </div>
);

const ScalesAndLinesSettingsComponent: React.FC<{
    settings: ScalesAndLinesSettings;
    onChange: <K extends keyof ScalesAndLinesSettings>(key: K, value: ScalesAndLinesSettings[K]) => void;
}> = ({ settings, onChange }) => (
    <div className="space-y-6">
        <div>
            <SectionTitle>Labels</SectionTitle>
            <div className="space-y-2">
                <CheckboxSettingRow
                    label="Last price label"
                    isChecked={settings.showLastPriceLabel}
                    onToggle={checked => onChange('showLastPriceLabel', checked)}
                />
                <CheckboxSettingRow
                    label="Price labels"
                    isChecked={settings.showPriceLabels}
                    onToggle={checked => onChange('showPriceLabels', checked)}
                />
                <CheckboxSettingRow
                    label="Countdown to bar close"
                    isChecked={settings.showCountdown}
                    onToggle={checked => onChange('showCountdown', checked)}
                />
            </div>
        </div>
        <div>
            <SectionTitle>Appearance</SectionTitle>
            <div className="space-y-4">
                <ToggleableColorRow
                    label="Grid lines"
                    isChecked={settings.showGrid}
                    onToggle={checked => onChange('showGrid', checked)}
                    color={settings.gridColor}
                    onColorChange={color => onChange('gridColor', color)}
                />
                <ToggleableColorRow
                    label="Crosshair"
                    isChecked={settings.showCrosshair}
                    onToggle={checked => onChange('showCrosshair', checked)}
                    color={settings.crosshairColor}
                    onColorChange={color => onChange('crosshairColor', color)}
                />
                <SelectSettingRow
                    label="Date Format"
                    value={settings.dateFormat}
                    onChange={value => onChange('dateFormat', value)}
                >
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="DD MMM YYYY">DD MMM YYYY</option>
                </SelectSettingRow>
                <SelectSettingRow
                    label="Time Format"
                    value={settings.timeFormat}
                    onChange={value => onChange('timeFormat', value)}
                >
                    <option value="hh:mm">24-hour</option>
                    <option value="hh:mm:ss">24-hour with seconds</option>
                    <option value="hh:mm AM/PM">12-hour</option>
                </SelectSettingRow>
            </div>
        </div>
    </div>
);

const CanvasSettingsComponent: React.FC<{
    settings: CanvasSettings;
    onChange: <K extends keyof CanvasSettings>(key: K, value: CanvasSettings[K]) => void;
}> = ({ settings, onChange }) => (
    <div className="space-y-6">
        <div>
            <SectionTitle>Background</SectionTitle>
            <div className="space-y-4">
                <RadioButtonGroup
                    options={[{ label: 'Solid', value: 'solid' }, { label: 'Gradient', value: 'gradient' }]}
                    selectedValue={settings.backgroundType}
                    onChange={value => onChange('backgroundType', value as 'solid' | 'gradient')}
                />
                {settings.backgroundType === 'solid' ? (
                    <ColorRow
                        label="Color"
                        color={settings.backgroundColor}
                        onChange={color => onChange('backgroundColor', color)}
                    />
                ) : (
                    <div className="space-y-2">
                        <ColorRow
                            label="Top color"
                            color={settings.gradientStartColor}
                            onChange={color => onChange('gradientStartColor', color)}
                        />
                        <ColorRow
                            label="Bottom color"
                            color={settings.gradientEndColor}
                            onChange={color => onChange('gradientEndColor', color)}
                        />
                    </div>
                )}
            </div>
        </div>
        <div>
            <SectionTitle>Text & Watermark</SectionTitle>
            <div className="space-y-4">
                <ColorRow
                    label="Scales text"
                    color={settings.textColor}
                    onChange={color => onChange('textColor', color)}
                />
                <CheckboxSettingRow
                    label="Watermark"
                    isChecked={settings.showWatermark}
                    onToggle={checked => onChange('showWatermark', checked)}
                />
                {settings.showWatermark && (
                    <>
                        <TextSettingRow
                            label="Text"
                            value={settings.watermarkText}
                            onChange={text => onChange('watermarkText', text)}
                            placeholder="e.g. EURUSD, 15m"
                        />
                        <ColorRow
                            label="Watermark color"
                            color={settings.watermarkColor}
                            onChange={color => onChange('watermarkColor', color)}
                        />
                    </>
                )}
            </div>
        </div>
    </div>
);


const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({ settings, onClose, onSave }) => {
    const [currentSettings, setCurrentSettings] = useState(settings);
    const initialSettings = useRef<ChartSettings | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTab>('Scales and lines');

    useEffect(() => {
        setCurrentSettings(settings);
        initialSettings.current = JSON.parse(JSON.stringify(settings));
    }, [settings]);

    const applyUpdate = (newSettings: ChartSettings) => {
        setCurrentSettings(newSettings);
        onSave(newSettings); // Live preview
    };

    const handleCancel = () => {
        if (initialSettings.current) {
            onSave(initialSettings.current);
        }
        onClose();
    };

    const handleSave = () => {
        onClose(); // Settings already applied
    };

    const handleChange = <T extends keyof ChartSettings, K extends keyof ChartSettings[T]>(
        category: T,
        key: K,
        value: ChartSettings[T][K]
    ) => {
        const newSettings = {
            ...currentSettings,
            [category]: {
                ...currentSettings[category],
                [key]: value
            }
        };
        applyUpdate(newSettings);
    };

    const tabs: { label: SettingsTab; icon: React.ReactNode }[] = [
        { label: 'Symbol', icon: <SymbolIcon className="w-5 h-5" /> },
        { label: 'Status line', icon: <StatusLineIcon className="w-5 h-5" /> },
        { label: 'Scales and lines', icon: <ScalesAndLinesIcon className="w-5 h-5" /> },
        { label: 'Canvas', icon: <CanvasIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]"
                onPointerDown={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-800">
                    <h2 className="font-semibold text-white text-lg">Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                </div>

                <div className="flex flex-1 min-h-0">
                    {/* Sidebar */}
                    <div className="w-1/3 md:w-1/4 border-r border-gray-800 p-3 space-y-1">
                        {tabs.map(tab => (
                            <TabButton
                                key={tab.label}
                                {...tab}
                                isActive={activeTab === tab.label}
                                onClick={() => setActiveTab(tab.label)}
                            />
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto text-sm">
                        {activeTab === 'Symbol' && <SymbolSettingsComponent settings={currentSettings.symbol} onChange={(key, value) => handleChange('symbol', key, value)} />}
                        {activeTab === 'Status line' && <StatusLineSettingsComponent settings={currentSettings.statusLine} onChange={(key, value) => handleChange('statusLine', key, value)} />}
                        {activeTab === 'Scales and lines' && <ScalesAndLinesSettingsComponent settings={currentSettings.scalesAndLines} onChange={(key, value) => handleChange('scalesAndLines', key, value)} />}
                        {activeTab === 'Canvas' && <CanvasSettingsComponent settings={currentSettings.canvas} onChange={(key, value) => handleChange('canvas', key, value)} />}
                    </div>
                </div>

                <div className="flex justify-between items-center p-4 bg-gray-800/50 border-t border-gray-800 rounded-b-xl">
                    <select className="bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option>Template: Default</option>
                    </select>
                    <div className="flex gap-3">
                        <button onClick={handleCancel} className="px-5 py-2 rounded-md font-semibold bg-gray-700 text-white hover:bg-gray-600">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 rounded-md font-semibold bg-blue-500 text-white hover:bg-blue-600">Ok</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChartSettingsModal;
