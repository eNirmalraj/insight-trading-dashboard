import React, { useState, useEffect } from 'react';
import { CloseIcon, BellIcon, SoundWaveIcon } from './IconComponents';
import { Drawing, AlertConditionType, FibonacciRetracementDrawing } from './market-chart/types';
import { FIB_LEVELS } from './market-chart/constants';
import { getIndicatorDefinition } from '../data/builtInIndicators';

interface CreateAlertModalProps {
    symbol: string;
    drawing: Drawing;
    onClose: () => void;
    initialAlert?: any; // PriceAlert type
    // Indicator Alert Mode
    indicatorId?: string;
    indicatorType?: string; // 'RSI', 'SMA', 'EMA', etc.
    onCreate: (settings: {
        condition: AlertConditionType;
        value?: number;
        fibLevel?: number;
        message: string;
        notifyApp: boolean;
        playSound: boolean;
        triggerFrequency: 'Only Once' | 'Once Per Bar' | 'Once Per Bar Close' | 'Once Per Minute';
        // Indicator fields
        indicatorId?: string;
        alertConditionId?: string;
        conditionParameters?: Record<string, any>;
    }) => void;
}

type Trigger = 'Only Once' | 'Once Per Bar' | 'Once Per Bar Close' | 'Once Per Minute';

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="bg-gray-700/80 border border-gray-600 rounded-md p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-gray-800 [&>option]:text-white" />
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="bg-gray-700/80 border border-gray-600 rounded-md p-2 text-sm text-white w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
);

const generateAlertMessage = (
    symbol: string,
    drawing: Drawing,
    condition: AlertConditionType,
    value: number,
    fibLevel?: number,
): string => {
    const priceStr = (value || 0).toFixed(5);
    switch (drawing.type) {
        case 'Rectangle':
        case 'Parallel Channel':
            return `${symbol} ${condition} ${drawing.type}`;
        case 'Fibonacci Retracement':
            return `${symbol} ${condition} Fib ${fibLevel} (${priceStr})`;
        default:
            return `${symbol} Price ${condition} ${priceStr}`;
    }
};

const CreateAlertModal: React.FC<CreateAlertModalProps> = ({
    symbol,
    drawing,
    onClose,
    onCreate,
    initialAlert,
    indicatorId,
    indicatorType
}) => {
    // Detect if this is an indicator alert
    const isIndicatorAlert = !!indicatorId && !!indicatorType;
    const indicatorDef = isIndicatorAlert ? getIndicatorDefinition(indicatorType) : null;

    // Standard alert state
    const [condition, setCondition] = useState<AlertConditionType>(initialAlert?.condition || 'Crossing');
    const [value, setValue] = useState(initialAlert?.value || 0);
    const [trigger, setTrigger] = useState<Trigger>(initialAlert?.triggerFrequency || 'Only Once');
    const [message, setMessage] = useState(initialAlert?.message || '');
    const [actions, setActions] = useState({ notify: initialAlert?.notifyApp ?? true, sound: initialAlert?.playSound ?? false });
    const [selectedFibLevel, setSelectedFibLevel] = useState<number>(initialAlert?.fibLevel || FIB_LEVELS[1]);

    // Indicator alert state
    const [selectedAlertCondition, setSelectedAlertCondition] = useState<any>(null);
    const [conditionParams, setConditionParams] = useState<Record<string, any>>({});

    useEffect(() => {
        if (initialAlert) return; // Don't override if editing

        let initialPrice = 0;
        let initialCondition: AlertConditionType = 'Crossing';

        switch (drawing.type) {
            case 'Horizontal Line':
                initialPrice = drawing.price;
                break;
            case 'Trend Line':
            case 'Ray':
                initialPrice = drawing.end.price;
                break;
            case 'Rectangle':
            case 'Parallel Channel':
                initialCondition = 'Entering Channel';
                break;
            case 'Fibonacci Retracement':
                const priceDiff = drawing.end.price - drawing.start.price;
                initialPrice = drawing.start.price + priceDiff * selectedFibLevel;
                break;
        }
        setValue(initialPrice);
        setCondition(initialCondition);
    }, [drawing, selectedFibLevel, initialAlert]);

    useEffect(() => {
        if (!initialAlert) {
            setMessage(generateAlertMessage(symbol, drawing, condition, value, selectedFibLevel));
        }
    }, [symbol, drawing, condition, value, selectedFibLevel, initialAlert]);

    const handleCreate = () => {
        if (isIndicatorAlert && selectedAlertCondition) {
            // Indicator alert mode
            onCreate({
                condition: 'Crossing' as AlertConditionType, // Placeholder, not used for indicator alerts
                message: message || `${indicatorType} ${selectedAlertCondition.name}`,
                notifyApp: actions.notify,
                playSound: actions.sound,
                triggerFrequency: trigger,
                // Indicator-specific fields
                indicatorId: indicatorId,
                alertConditionId: selectedAlertCondition.id,
                conditionParameters: conditionParams,
            });
        } else {
            // Standard drawing/price alert mode
            onCreate({
                condition,
                value: (drawing.type !== 'Rectangle' && drawing.type !== 'Parallel Channel') ? value : undefined,
                fibLevel: drawing.type === 'Fibonacci Retracement' ? selectedFibLevel : undefined,
                message,
                notifyApp: actions.notify,
                playSound: actions.sound,
                triggerFrequency: trigger,
            });
        }
        onClose();
    };

    const getOperatorsForDrawing = (): AlertConditionType[] => {
        switch (drawing.type) {
            case 'Rectangle':
            case 'Parallel Channel':
                return ['Entering Channel', 'Exiting Channel'];
            default:
                return ['Crossing', 'Crossing Up', 'Crossing Down', 'Greater Than', 'Less Than'];
        }
    };

    return (
        <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-gray-800/80 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl z-50 text-gray-300 flex flex-col"
            onPointerDown={e => e.stopPropagation()}
        >
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
                <h2 className="font-semibold text-white text-lg">
                    {initialAlert ? 'Edit Alert' : 'Create Alert'} on {symbol} ({isIndicatorAlert ? indicatorType : drawing.type})
                </h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                {/* INDICATOR ALERT MODE */}
                {isIndicatorAlert && indicatorDef?.alertConditions && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-gray-400">Alert Condition</label>
                            <Select
                                value={selectedAlertCondition?.id || ''}
                                onChange={(e) => {
                                    const condition = indicatorDef.alertConditions.find((c: any) => c.id === e.target.value);
                                    setSelectedAlertCondition(condition);
                                    // Initialize parameters with defaults
                                    const params: Record<string, any> = {};
                                    condition?.parameters?.forEach((p: any) => {
                                        params[p.name] = p.default;
                                    });
                                    setConditionParams(params);
                                }}
                            >
                                <option value="">Select condition...</option>
                                {indicatorDef.alertConditions.map((cond: any) => (
                                    <option key={cond.id} value={cond.id}>
                                        {cond.name}
                                    </option>
                                ))}
                            </Select>
                            {selectedAlertCondition && (
                                <p className="text-xs text-gray-500">{selectedAlertCondition.description}</p>
                            )}
                        </div>

                        {/* Dynamic Parameter Inputs */}
                        {selectedAlertCondition?.parameters?.map((param: any) => (
                            <div key={param.name} className="space-y-3">
                                <label className="text-sm font-medium text-gray-400 capitalize">{param.name}</label>
                                <Input
                                    type="number"
                                    value={conditionParams[param.name] || param.default}
                                    onChange={(e) => setConditionParams(prev => ({ ...prev, [param.name]: parseFloat(e.target.value) }))}
                                    min={param.min}
                                    max={param.max}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* STANDARD DRAWING/PRICE ALERT MODE */}
                {!isIndicatorAlert && (
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-400">Condition</label>
                        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700 flex items-center gap-2">
                            <span className="font-semibold">{symbol}</span>
                            <Select value={condition} onChange={e => setCondition(e.target.value as AlertConditionType)}>
                                {getOperatorsForDrawing().map(op => <option key={op} value={op}>{op}</option>)}
                            </Select>

                            {drawing.type === 'Fibonacci Retracement' && (
                                <Select value={selectedFibLevel} onChange={e => setSelectedFibLevel(parseFloat(e.target.value))}>
                                    {FIB_LEVELS.map(level => <option key={level} value={level}>Fib {level}</option>)}
                                </Select>
                            )}

                            {['Horizontal Line', 'Trend Line', 'Ray', 'Fibonacci Retracement'].includes(drawing.type) && (
                                <Input type="number" step="0.00001" value={value} onChange={e => setValue(parseFloat(e.target.value))} />
                            )}
                        </div>
                    </div>
                )}

                {/* SHARED SECTIONS */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-gray-400">Trigger</label>
                    <div className="grid grid-cols-2 gap-1 bg-gray-900/50 border border-gray-700 rounded-lg p-1">
                        <TriggerButton name="Only Once" isActive={trigger === 'Only Once'} onClick={setTrigger} />
                        <TriggerButton name="Once Per Bar" isActive={trigger === 'Once Per Bar'} onClick={setTrigger} />
                        <TriggerButton name="Once Per Bar Close" isActive={trigger === 'Once Per Bar Close'} onClick={setTrigger} />
                        <TriggerButton name="Once Per Minute" isActive={trigger === 'Once Per Minute'} onClick={setTrigger} />
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-gray-400">Actions</label>
                    <div className="space-y-2">
                        <ActionCheckbox label="Notify on app" icon={<BellIcon className="w-5 h-5" />} checked={actions.notify} onChange={c => setActions(a => ({ ...a, notify: c }))} />
                        <ActionCheckbox label="Play sound" icon={<SoundWaveIcon className="w-5 h-5" />} checked={actions.sound} onChange={c => setActions(a => ({ ...a, sound: c }))} />
                    </div>
                </div>

                <div className="space-y-3">
                    <label htmlFor="alert-message" className="text-sm font-medium text-gray-400">Message</label>
                    <textarea id="alert-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
                        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Alert will trigger when..."
                    />
                </div>
            </div>

            <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
                <button onClick={handleCreate} className="px-5 py-2 rounded-md text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600">
                    {initialAlert ? 'Save' : 'Create'}
                </button>
            </div>
        </div>
    );
};

// Sub-components
const TriggerButton: React.FC<{ name: Trigger; isActive: boolean; onClick: (name: Trigger) => void }> = ({ name, isActive, onClick }) => (
    <button onClick={() => onClick(name)} className={`w-full text-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-blue-500/30 text-blue-300' : 'text-gray-400 hover:bg-gray-700/50'}`}>
        {name}
    </button>
);

const ActionCheckbox: React.FC<{ label: string; icon: React.ReactNode; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, icon, checked, onChange }) => (
    <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-blue-500/10 border-blue-500/30 text-white' : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-600'}`}>
        <div className="text-blue-400">{icon}</div>
        <span className="flex-1 font-medium">{label}</span>
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            className="w-5 h-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-2"
        />
    </label>
);

export default CreateAlertModal;
