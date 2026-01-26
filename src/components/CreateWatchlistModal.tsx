import React, { useState } from 'react';
import { CloseIcon, BriefcaseIcon, SubscriptionIcon } from './IconComponents';
import { AVAILABLE_STRATEGIES } from '../constants';
import CustomSelect from './CustomSelect';

interface CreateWatchlistModalProps {
  onClose: () => void;
  onCreate: (name: string, type: 'Forex' | 'Crypto', strategy: string) => void;
  simple?: boolean;
  defaultType?: 'Forex' | 'Crypto';
}

const TypeButton: React.FC<{ label: string, icon: React.ReactNode, isSelected: boolean, onClick: () => void }> = ({ label, icon, isSelected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-colors duration-200 ${
      isSelected 
        ? 'bg-blue-500/10 border-blue-500 text-white' 
        : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:border-gray-500'
    }`}
  >
    {icon}
    <span className="mt-2 font-semibold">{label}</span>
  </button>
);

const CreateWatchlistModal: React.FC<CreateWatchlistModalProps> = ({ onClose, onCreate, simple = false, defaultType = 'Forex' }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'Forex' | 'Crypto' | null>(simple ? defaultType : null);
  const [strategy, setStrategy] = useState('No Strategy');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && type) {
      const strategyToSave = simple ? '' : (strategy === 'No Strategy' ? '' : strategy);
      onCreate(name.trim(), type, strategyToSave);
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
          <h2 className="font-semibold text-white text-lg">Create New Watchlist</h2>
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
                placeholder="e.g., 'My Swing Trades'"
                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
            </div>
            {!simple && (
                <>
                    <CustomSelect
                      label="Strategy Type"
                      options={AVAILABLE_STRATEGIES}
                      selected={strategy}
                      onSelect={setStrategy}
                    />
                    <div>
                      <label className="text-sm font-medium text-gray-400 mb-2 block">Watchlist Type</label>
                      <div className="grid grid-cols-2 gap-4">
                        <TypeButton 
                          label="Forex" 
                          icon={<BriefcaseIcon className="w-6 h-6" />}
                          isSelected={type === 'Forex'}
                          onClick={() => setType('Forex')}
                        />
                        <TypeButton 
                          label="Crypto" 
                          icon={<SubscriptionIcon className="w-6 h-6" />}
                          isSelected={type === 'Crypto'}
                          onClick={() => setType('Crypto')}
                        />
                      </div>
                    </div>
                </>
            )}
          </div>
          
          <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
            <button type="submit" disabled={!name.trim() || !type} className="px-6 py-2 rounded-md text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateWatchlistModal;
