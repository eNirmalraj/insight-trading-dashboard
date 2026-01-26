import React, { useState, useEffect } from 'react';
import { AlertStatus } from '../types';
import { CloseIcon } from './IconComponents';
import * as api from '../api';

interface CreatePriceAlertModalProps {
    symbol: string;
    price: number;
    onClose: () => void;
}

const CreatePriceAlertModal: React.FC<CreatePriceAlertModalProps> = ({ symbol, price, onClose }) => {
    const [condition, setCondition] = useState('Crossing');
    const [value, setValue] = useState(price);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setMessage(`${symbol} Price ${condition} ${value.toFixed(5)}`);
    }, [symbol, condition, value]);

    const handleCreate = async () => {
        const alertData = {
            symbol,
            condition,
            value,
            message,
            status: AlertStatus.LIVE,
        };
        try {
            await api.createPriceAlert(alertData);
            alert('Price alert created successfully!');
            onClose();
        } catch (e) {
            console.error("Failed to save price alert", e);
            alert("Error: Could not save alert.");
        }
    };

    const conditions = ['Crossing', 'Greater Than', 'Less Than'];

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
                className="w-full max-w-md bg-gray-800/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl z-50 text-gray-300 flex flex-col"
                onPointerDown={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-white text-lg">Create Price Alert</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold">{symbol}</span>
                        <select value={condition} onChange={e => setCondition(e.target.value)} className="bg-gray-700/80 border border-gray-600 rounded-md p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                            {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <input type="number" step="0.00001" value={value} onChange={e => setValue(parseFloat(e.target.value))} className="bg-gray-700/80 border border-gray-600 rounded-md p-2 text-sm text-white w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label htmlFor="alert-message" className="text-sm font-medium text-gray-400">Message</label>
                        <textarea id="alert-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                        />
                    </div>
                </div>

                <div className="flex justify-end items-center p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-700/50">Cancel</button>
                    <button onClick={handleCreate} className="px-5 py-2 rounded-md text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600">Create</button>
                </div>
            </div>
        </div>
    );
};

export default CreatePriceAlertModal;
