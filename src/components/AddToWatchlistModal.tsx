import React from 'react';
import { Watchlist } from '../types';
import { CloseIcon, WatchlistIcon } from './IconComponents';

interface AddToWatchlistModalProps {
  pair: string;
  watchlists: Watchlist[];
  existingWatchlistIds: string[];
  onClose: () => void;
  onSelectWatchlist: (watchlistId: string) => void;
  onCreateWatchlist: () => void;
}

const AddToWatchlistModal: React.FC<AddToWatchlistModalProps> = ({
  pair,
  watchlists,
  existingWatchlistIds,
  onClose,
  onSelectWatchlist,
  onCreateWatchlist,
}) => {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onPointerDown={(e) => e.currentTarget === e.target && onClose()}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-sm flex flex-col"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white text-lg">Add '{pair}' to...</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {watchlists.length > 0 ? (
            <ul className="space-y-2">
              {watchlists.map((wl) => {
                const isAdded = existingWatchlistIds.includes(wl.id);
                return (
                  <li key={wl.id}>
                    <button
                      onClick={() => onSelectWatchlist(wl.id)}
                      disabled={isAdded}
                      className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-900/50 hover:bg-gray-700/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-gray-900/50"
                    >
                      <div className="flex items-center gap-3">
                        <WatchlistIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-white">{wl.name}</p>
                          <p className="text-xs text-gray-400">{wl.items.length} items</p>
                        </div>
                      </div>
                      {isAdded && <span className="text-xs text-green-400 font-semibold">Added</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p>No compatible watchlists found for this symbol type.</p>
              <button
                onClick={onCreateWatchlist}
                className="mt-4 bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create a New Watchlist
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddToWatchlistModal;
