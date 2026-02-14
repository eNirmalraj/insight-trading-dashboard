import React, { useState, useMemo, useEffect } from 'react';
import { Signal, TradeDirection, Position, PositionStatus } from '../types';
import { CloseIcon, MinusIcon, PlusIcon } from './IconComponents';

interface ExecuteTradeModalProps {
  signal: Signal;
  onClose: () => void;
  onExecute: (newPosition: Position) => void;
}

const isCryptoPair = (pair: string) => pair.includes('USDT') || pair.includes('BTC');

const ExecuteTradeModal: React.FC<ExecuteTradeModalProps> = ({ signal, onClose, onExecute }) => {
  const [account, setAccount] = useState<'Forex' | 'Binance'>(isCryptoPair(signal.pair) ? 'Binance' : 'Forex');
  const [leverage, setLeverage] = useState(20);
  const [amountType, setAmountType] = useState<'USDT' | 'Quantity'>('USDT');
  const [quantity, setQuantity] = useState<string>(''); // User input as string to handle decimals better
  const [riskPercent, setRiskPercent] = useState<number>(1);

  // Auto-fill prices
  const [entryPrice, setEntryPrice] = useState(signal.entry);
  const [stopLoss, setStopLoss] = useState(signal.stopLoss);
  const [takeProfit, setTakeProfit] = useState(signal.takeProfit);

  const [availableBalance] = useState(1000.00); // Mock Balance

  const isForex = account === 'Forex';
  const isCrypto = account === 'Binance';

  useEffect(() => {
    const isCryptoSignal = isCryptoPair(signal.pair);
    setAccount(isCryptoSignal ? 'Binance' : 'Forex');
    setQuantity(isCryptoSignal ? '100' : '0.1'); // Default $100 for crypto, 0.1 lots for forex
    setAmountType(isCryptoSignal ? 'USDT' : 'Quantity');
    setEntryPrice(signal.entry);
    setStopLoss(signal.stopLoss);
    setTakeProfit(signal.takeProfit);
    setLeverage(20);
    setRiskPercent(1);
  }, [signal]);

  const handleRiskChange = (percent: number) => {
    setRiskPercent(percent);
    if (!stopLoss || stopLoss === 0) return;

    const riskAmount = availableBalance * (percent / 100);
    const priceDiff = Math.abs(entryPrice - stopLoss);
    if (priceDiff === 0) return;

    const unitsToBuy = riskAmount / priceDiff;

    if (amountType === 'Quantity') {
      setQuantity(unitsToBuy.toFixed(4));
    } else {
      // USDT Amount = Units * Entry
      setQuantity((unitsToBuy * entryPrice).toFixed(2));
    }
  };

  // Derived Values
  const numericQty = parseFloat(quantity) || 0;

  const positionSizeCoins = useMemo(() => {
    if (isForex) return numericQty; // Lots
    if (amountType === 'Quantity') return numericQty;
    // If USDT, convert to coins: (USDT Amount * Leverage) / Price ?? OR (USDT Amount / Price) * Leverage?
    // Standard UI: "Cost" = $100. Leverage = 20x. Position Size = $2000. Coins = 2000 / Price.
    // OR "Amount" = $100 (Total Size). Cost = $5.
    // Let's assume User enters "Margin Cost" (Investment).
    // NO, usually users enter "Total Size" in USDT or Coins.
    // Let's assume input is "Total Position Size" in USDT. 
    return (numericQty) / entryPrice;
  }, [amountType, numericQty, entryPrice, isForex]);

  const marginRequired = useMemo(() => {
    if (isForex) return 0; // Forex margin logic is complex, ignore for now
    // Margin = (Position Size Coins * Entry Price) / Leverage
    return (positionSizeCoins * entryPrice) / leverage;
  }, [positionSizeCoins, entryPrice, leverage, isForex]);

  const potentialProfit = useMemo(() => {
    const contractSize = isForex ? 100000 : 1;
    const priceDiff = Math.abs(takeProfit - entryPrice);
    // Profit = Price Diff * Coins
    return priceDiff * positionSizeCoins * contractSize;
  }, [takeProfit, entryPrice, positionSizeCoins, isForex]);

  const potentialLoss = useMemo(() => {
    const contractSize = isForex ? 100000 : 1;
    const priceDiff = Math.abs(stopLoss - entryPrice);
    return priceDiff * positionSizeCoins * contractSize;
  }, [stopLoss, entryPrice, positionSizeCoins, isForex]);

  const riskRewardRatio = useMemo(() => {
    if (potentialLoss === 0) return '∞';
    return (potentialProfit / potentialLoss).toFixed(2);
  }, [potentialProfit, potentialLoss]);

  const handleSubmit = async () => {
    onExecute({
      id: `p${Date.now()}`,
      symbol: signal.pair,
      account: account,
      direction: signal.direction,
      quantity: positionSizeCoins,
      entryPrice: entryPrice,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      pnl: 0,
      status: PositionStatus.OPEN,
      openTime: new Date().toISOString(),
      leverage: isCrypto ? leverage : undefined
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onPointerDown={e => e.currentTarget === e.target && onClose()}
    >
      <div
        className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col border border-gray-800"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/50 rounded-t-xl">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              {signal.pair}
              <span className={`px-2 py-0.5 text-xs rounded-md ${signal.direction === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {account === 'Binance' ? 'Perpetual' : 'Forex'}
              </span>
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* LEFT COLUMN: Signal Details & Estimates */}
          <div className="space-y-5">
            {/* Top Stats */}
            <div className="flex justify-between items-center text-center bg-gray-800/40 p-3 rounded-lg border border-gray-700/50 shadow-inner">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Side</span>
                <span className={`font-bold text-lg ${signal.direction === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>{signal.direction}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Entry</span>
                <span className="font-mono text-white font-medium">{entryPrice}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">R:R</span>
                <span className="font-mono text-blue-400 font-medium">{riskRewardRatio}</span>
              </div>
            </div>

            {/* Price Inputs */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Stop Loss</label>
                  <span className={`text-[10px] font-mono ${stopLoss < entryPrice ? 'text-red-400' : 'text-red-400'}`}>
                    {((stopLoss - entryPrice) / entryPrice * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="relative group">
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={e => setStopLoss(parseFloat(e.target.value))}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-sm text-red-300 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50 outline-none font-mono transition-all group-hover:bg-gray-800"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="text-gray-600 text-xs">USDT</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] text-gray-500 uppercase font-bold">Take Profit</label>
                  <span className={`text-[10px] font-mono ${takeProfit > entryPrice ? 'text-green-400' : 'text-green-400'}`}>
                    {((takeProfit - entryPrice) / entryPrice * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="relative group">
                  <input
                    type="number"
                    value={takeProfit}
                    onChange={e => setTakeProfit(parseFloat(e.target.value))}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 text-sm text-green-300 focus:ring-1 focus:ring-green-500/50 focus:border-green-500/50 outline-none font-mono transition-all group-hover:bg-gray-800"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <span className="text-gray-600 text-xs">USDT</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Calculations Footer */}
            <div className="bg-gray-800/50 p-4 rounded-lg space-y-2 text-xs border border-gray-700/30">
              <div className="flex justify-between">
                <span className="text-gray-400">Position Size</span>
                <span className="text-white font-mono">{positionSizeCoins.toFixed(4)} {signal.pair.replace('USDT', '')}</span>
              </div>
              {isCrypto && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Margin Cost</span>
                  <span className="text-yellow-400 font-bold font-mono">{marginRequired.toFixed(2)} USDT</span>
                </div>
              )}
              <div className="border-t border-gray-700/50 my-2"></div>
              <div className="flex justify-between">
                <span className="text-gray-400">Est. Profit</span>
                <span className="text-green-400 font-bold font-mono">+{potentialProfit.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Est. Loss</span>
                <span className="text-red-400 font-bold font-mono">-{potentialLoss.toFixed(2)} USDT</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Controls (Leverage, Risk, Execution) */}
          <div className="space-y-5 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Account Selector */}
              <div className="bg-gray-800/50 p-1 rounded-lg flex text-xs font-medium">
                <button
                  onClick={() => setAccount('Forex')}
                  disabled={isCrypto}
                  className={`flex-1 py-2 rounded-md transition-colors ${!isCrypto ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 cursor-not-allowed'}`}
                >Forex</button>
                <button
                  onClick={() => setAccount('Binance')}
                  disabled={isForex}
                  className={`flex-1 py-2 rounded-md transition-colors ${isCrypto ? 'bg-yellow-600 text-white shadow-lg' : 'text-gray-500 cursor-not-allowed'}`}
                >Crypto (Futures)</button>
              </div>

              {/* Crypto Specific: Leverage & Margin */}
              {isCrypto && (
                <div className="space-y-5">
                  {/* Leverage Slider */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>Isolation</span>
                      <span className="text-yellow-400 font-bold">{leverage}x</span>
                    </div>
                    <input
                      type="range" min="1" max="125" step="1"
                      value={leverage} onChange={e => setLeverage(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                      <span>1x</span>
                      <span>20x</span>
                      <span>50x</span>
                      <span>125x</span>
                    </div>
                  </div>

                  {/* Risk % Selector */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>Risk ({riskPercent}%)</span>
                      <span className="text-gray-400">Bal: <span className="text-white font-mono">{availableBalance.toFixed(0)}</span> | Risk: <span className="text-red-400 font-mono">${(availableBalance * (riskPercent / 100)).toFixed(2)}</span></span>
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 5].map(p => (
                        <button
                          key={p}
                          onClick={() => handleRiskChange(p)}
                          className={`flex-1 py-1.5 text-xs rounded border transition-all ${riskPercent === p ? 'bg-red-500/20 border-red-500 text-red-400 font-bold' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                        >
                          {p}%
                        </button>
                      ))}
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={riskPercent === 0 && quantity !== '0' ? '' : riskPercent}
                          onChange={(e) => handleRiskChange(parseFloat(e.target.value) || 0)}
                          className="w-full h-full bg-gray-800 border border-gray-700 rounded text-center text-xs text-white focus:border-red-500 outline-none font-mono"
                          placeholder="Custom"
                        />
                        <span className="absolute right-1 top-1 text-[10px] text-gray-500">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Size Input */}
                  <div className="relative">
                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Amount</label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        value={quantity}
                        onChange={e => {
                          setQuantity(e.target.value);
                          setRiskPercent(0);
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2.5 pl-3 pr-20 text-white font-mono placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 text-sm"
                        placeholder="0.00"
                      />
                      <div className="absolute right-2 flex items-center gap-2">
                        <span className="text-xs text-gray-400">{amountType}</span>
                        <button
                          onClick={() => setAmountType(prev => prev === 'USDT' ? 'Quantity' : 'USDT')}
                          className="p-1 hover:bg-gray-700 rounded text-blue-400 hover:text-blue-300 transition-colors"
                          title="Switch Unit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-800">
              <button onClick={onClose} className="py-3 rounded-lg text-sm font-semibold text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors">Cancel</button>
              <button
                onClick={handleSubmit}
                className={`py-3 rounded-lg text-sm font-bold text-white shadow-lg transition-all ${signal.direction === 'BUY'
                  ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-green-900/20'
                  : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-900/20'
                  }`}
              >
                {signal.direction} {isCrypto ? `${leverage}x` : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecuteTradeModal;
