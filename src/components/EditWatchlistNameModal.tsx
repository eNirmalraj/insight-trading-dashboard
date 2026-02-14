import React, { useState } from 'react';
import { CloseIcon, RiskIcon } from './IconComponents';
import { AVAILABLE_STRATEGIES } from '../constants';
import CustomSelect from './CustomSelect';
import { AccountType } from '../types';

interface EditWatchlistNameModalProps {
  currentName: string;
  currentStrategy?: string;
  currentTradingMode?: 'paper' | 'live';
  accountType?: AccountType; // Added accountType for conditional rendering
  currentRiskSettings?: {
    lotSize: number;
    riskPercent: number;
    leverage: number;
    stopLossDistance: number;
    takeProfitDistance: number;
    trailingStopLossDistance: number;
  };
  onClose: () => void;
  currentExecutionTimeframes?: string[];
  manualRiskEnabled?: boolean;
  onSave: (
    newName: string,
    newStrategy: string,
    newTradingMode: 'paper' | 'live',
    riskSettings: {
      lotSize: number;
      riskPercent: number;
      leverage: number;
      stopLossDistance: number;
      takeProfitDistance: number;
      trailingStopLossDistance: number;
    },
    executionTimeframes?: string[],
    manualRiskEnabled?: boolean,
    marketType?: 'spot' | 'futures',
    riskMethod?: 'fixed' | 'percent',
    autoLeverageEnabled?: boolean
  ) => void;
}

const EditWatchlistNameModal: React.FC<EditWatchlistNameModalProps> = ({
  currentName,
  currentStrategy,
  currentTradingMode = 'paper',
  accountType,
  currentRiskSettings,
  currentExecutionTimeframes = [],
  manualRiskEnabled: currentManualRiskEnabled = false,
  onClose,
  onSave
}) => {
  const [name, setName] = useState(currentName);
  const [strategy, setStrategy] = useState(currentStrategy || AVAILABLE_STRATEGIES[0]);
  const [tradingMode, setTradingMode] = useState<'paper' | 'live'>(currentTradingMode);
  // Crypto Specific State
  const [marketType, setMarketType] = useState<'spot' | 'futures'>('spot'); // Default to spot, should ideally come from props if saved
  const [riskMethod, setRiskMethod] = useState<'fixed' | 'percent'>('fixed');
  const [autoLeverageEnabled, setAutoLeverageEnabled] = useState(false);

  const [executionTimeframes, setExecutionTimeframes] = useState<string>(
    currentExecutionTimeframes.length > 0 ? currentExecutionTimeframes[0] : '1H'
  );
  const [manualRiskEnabled, setManualRiskEnabled] = useState(currentManualRiskEnabled);

  // Risk State
  const [lotSize, setLotSize] = useState(currentRiskSettings?.lotSize || 0.01);
  const [riskPercent, setRiskPercent] = useState(currentRiskSettings?.riskPercent || 1.0);
  const [leverage, setLeverage] = useState(currentRiskSettings?.leverage || 1);
  const [stopLossDistance, setStopLossDistance] = useState(currentRiskSettings?.stopLossDistance || 0);
  const [takeProfitDistance, setTakeProfitDistance] = useState(currentRiskSettings?.takeProfitDistance || 0);
  const [trailingStopLossDistance, setTrailingStopLossDistance] = useState(currentRiskSettings?.trailingStopLossDistance || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      // Send the single selected timeframe as an array.
      const timeframes = [executionTimeframes];

      onSave(
        name.trim(),
        strategy,
        tradingMode,
        {
          lotSize: Number(lotSize),
          riskPercent: Number(riskPercent),
          leverage: Number(leverage),
          stopLossDistance: Number(stopLossDistance),
          takeProfitDistance: Number(takeProfitDistance),
          trailingStopLossDistance: Number(trailingStopLossDistance)
        },
        timeframes,
        manualRiskEnabled,
        marketType,
        riskMethod,
        autoLeverageEnabled
      );
    }
  };

  const isCrypto = accountType === AccountType.CRYPTO;
  const isForex = accountType === AccountType.FOREX;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onPointerDown={e => e.currentTarget === e.target && onClose()}
    >
      <div
        className="w-full max-w-2xl bg-gray-800/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl z-50 text-gray-300 flex flex-col max-h-[90vh] overflow-y-auto"
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-700 sticky top-0 bg-gray-800/95 z-10">
          <h2 className="font-semibold text-white text-lg">Edit Watchlist & Risk Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-8">
            {/* General Settings Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider border-b border-gray-700 pb-2">General Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="watchlist-name" className="text-sm font-medium text-gray-400 mb-2 block">Watchlist Name</label>
                  <input
                    id="watchlist-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <CustomSelect
                    label="Entry Timeframe"
                    options={['1m', '5m', '15m', '30m', '1H', '4H', '1D']}
                    selected={executionTimeframes}
                    onSelect={(val) => setExecutionTimeframes(val)}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Restrict execution to signals from this specific timeframe.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CustomSelect
                  label="Strategy Type"
                  options={AVAILABLE_STRATEGIES}
                  selected={strategy}
                  onSelect={setStrategy}
                />
                <CustomSelect
                  label="Trading Mode"
                  options={['Paper Trading', 'Live Trading']}
                  selected={tradingMode === 'paper' ? 'Paper Trading' : 'Live Trading'}
                  onSelect={(value) => setTradingMode(value === 'Paper Trading' ? 'paper' : 'live')}
                />
              </div>

              {/* Crypto Market Type Selection */}
              {isCrypto && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <CustomSelect
                    label="Market Type"
                    options={['Spot', 'Futures']}
                    selected={marketType === 'spot' ? 'Spot' : 'Futures'}
                    onSelect={(val) => setMarketType(val === 'Spot' ? 'spot' : 'futures')}
                  />
                  <CustomSelect
                    label="Risk Method"
                    options={['Fixed Amount ($)', 'Risk % of Balance']}
                    selected={riskMethod === 'fixed' ? 'Fixed Amount ($)' : 'Risk % of Balance'}
                    onSelect={(val) => setRiskMethod(val === 'Fixed Amount ($)' ? 'fixed' : 'percent')}
                  />
                </div>
              )}

            </div>

            {/* Risk Management Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-700 pb-2">
                <div className="flex items-center gap-2">
                  <RiskIcon className="w-4 h-4 text-yellow-500" />
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Global Risk Settings</h3>
                </div>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <span className="text-xs font-semibold text-gray-400 group-hover:text-blue-400 transition-colors">Manual Risk Entry</span>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={manualRiskEnabled}
                      onChange={(e) => setManualRiskEnabled(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                </label>
              </div>
              <p className="text-xs text-gray-500">
                {manualRiskEnabled
                  ? "OVERRIDE ACTIVE: Using manual SL/TP distances instead of strategy rules."
                  : "Using strategy-defined Stop Loss and Take Profit levels."}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Lot Size / Risk % / Fixed Amount */}
                {isForex && (
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-1.5 block">Lot Size</label>
                    <input type="number" step="0.01" min="0.01" value={lotSize} onChange={e => setLotSize(Number(e.target.value))} className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white" />
                  </div>
                )}

                {/* Crypto Input Logic */}
                {isCrypto && (
                  <>
                    {riskMethod === 'fixed' ? (
                      <div>
                        <label className="text-xs font-medium text-gray-400 mb-1.5 block">Amount (USDT)</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={lotSize} // Reusing lotSize for Amount
                          onChange={e => setLotSize(Number(e.target.value))}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs font-medium text-gray-400 mb-1.5 block">Risk % per Trade</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={riskPercent}
                          onChange={e => setRiskPercent(Number(e.target.value))}
                          className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white"
                        />
                      </div>
                    )}

                    {/* Leverage Logic */}
                    {marketType === 'futures' && (
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-xs font-medium text-gray-400">Leverage (x)</label>
                          {riskMethod === 'percent' && (
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={autoLeverageEnabled}
                                onChange={e => setAutoLeverageEnabled(e.target.checked)}
                                className="w-3 h-3 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-[10px] text-blue-400">Auto Calc</span>
                            </label>
                          )}
                        </div>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="125"
                          value={leverage}
                          disabled={autoLeverageEnabled && riskMethod === 'percent'}
                          onChange={e => setLeverage(Number(e.target.value))}
                          className={`w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white ${autoLeverageEnabled && riskMethod === 'percent' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        {autoLeverageEnabled && riskMethod === 'percent' && <p className="text-[10px] text-gray-500 mt-1">Leverage calculated dynamically</p>}
                      </div>
                    )}
                  </>
                )}

                {/* Forex Risk % (if not crypto) */}
                {!isCrypto && (
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-1.5 block">Risk % per Trade</label>
                    <input type="number" step="0.1" min="0.1" value={riskPercent} onChange={e => setRiskPercent(Number(e.target.value))} className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Stop Loss Distance</label>
                  <input type="number" step="0.0001" min="0" value={stopLossDistance} onChange={e => setStopLossDistance(Number(e.target.value))} className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white" />
                  <p className="text-[10px] text-gray-500 mt-1">0 = Auto (Dynamic)</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Take Profit Distance</label>
                  <input type="number" step="0.0001" min="0" value={takeProfitDistance} onChange={e => setTakeProfitDistance(Number(e.target.value))} className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white" />
                  <p className="text-[10px] text-gray-500 mt-1">0 = Auto (Dynamic)</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1.5 block">Trailing Stop Loss</label>
                  <input type="number" step="0.0001" min="0" value={trailingStopLossDistance} onChange={e => setTrailingStopLossDistance(Number(e.target.value))} className="w-full bg-gray-900/50 border border-gray-700 rounded p-2 text-sm text-white" />
                  <p className="text-[10px] text-gray-500 mt-1">Distance to trail price</p>
                </div>
              </div>
            </div>

          </div>
          <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-3 sticky bottom-0">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
            <button type="submit" disabled={!name.trim()} className="px-6 py-2 rounded-md text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditWatchlistNameModal;
