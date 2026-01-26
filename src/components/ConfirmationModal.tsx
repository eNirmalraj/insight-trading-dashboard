import React from 'react';
import { CloseIcon, ExclamationCircleIcon } from './IconComponents';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete' }) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
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
          <h2 className="font-semibold text-white text-lg flex items-center gap-2">
            <ExclamationCircleIcon className="w-6 h-6 text-yellow-400" />
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-300">{message}</p>
        </div>
        <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
          <button onClick={handleConfirm} className="px-6 py-2 rounded-md text-sm font-semibold bg-red-500 text-white hover:bg-red-600">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
