import React, { useState } from 'react';
import { CloseIcon } from './IconComponents';

interface AddSymbolModalProps {
  watchlistName: string;
  accountType: 'Forex' | 'Crypto';
  onClose: () => void;
  onAdd: (symbol: string) => void;
}

const AddSymbolModal: React.FC<AddSymbolModalProps> = ({ watchlistName, accountType, onClose, onAdd }) => {
  const [symbol, setSymbol] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      onAdd(symbol.trim());
    }
  };

  return (
     <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onPointerDown={e => e.currentTarget === e.target && onClose()}
    >
      <div 
        className="w-full max-w-md bg-gray-800/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl z-50 text-gray-300 flex flex-col"
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white text-lg">Add Symbol to {watchlistName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label htmlFor="symbol-name" className="text-sm font-medium text-gray-400 mb-2 block">Symbol ({accountType})</label>
            <input
              id="symbol-name"
              type="text"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder={accountType === 'Forex' ? "e.g., EUR/USD" : "e.g., BTC/USDT"}
              className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
            <button type="submit" disabled={!symbol.trim()} className="px-6 py-2 rounded-md text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed">Add Symbol</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSymbolModal;
