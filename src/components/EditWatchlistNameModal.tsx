import React, { useState } from 'react';
import { CloseIcon } from './IconComponents';
import { AVAILABLE_STRATEGIES } from '../constants';
import CustomSelect from './CustomSelect';

interface EditWatchlistNameModalProps {
  currentName: string;
  currentStrategy?: string;
  onClose: () => void;
  onSave: (newName: string, newStrategy: string) => void;
}

const EditWatchlistNameModal: React.FC<EditWatchlistNameModalProps> = ({ currentName, currentStrategy, onClose, onSave }) => {
  const [name, setName] = useState(currentName);
  const [strategy, setStrategy] = useState(currentStrategy || 'No Strategy');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      const strategyToSave = strategy === 'No Strategy' ? '' : strategy;
      onSave(name.trim(), strategyToSave);
    }
  };

  const isUnchanged = name.trim() === currentName && (strategy === 'No Strategy' ? '' : strategy).trim() === (currentStrategy || '');

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
          <h2 className="font-semibold text-white text-lg">Edit Watchlist</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            <div>
              <label htmlFor="watchlist-name" className="text-sm font-medium text-gray-400 mb-2 block">Watchlist Name</label>
              <input
                id="watchlist-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
            </div>
            <CustomSelect
              label="Strategy Type"
              options={AVAILABLE_STRATEGIES}
              selected={strategy}
              onSelect={setStrategy}
            />
          </div>
          <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
            <button type="submit" disabled={!name.trim() || isUnchanged} className="px-6 py-2 rounded-md text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditWatchlistNameModal;
