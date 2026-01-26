import React, { useState, useEffect } from 'react';
import { Point } from './types';

interface CoordinateInputProps {
    label: string;
    price: number;
    time: number;
    onUpdate: (point: Point) => void;
}

export const CoordinateInput: React.FC<CoordinateInputProps> = ({ label, price, time, onUpdate }) => {
    const [priceStr, setPriceStr] = useState(price.toString());

    useEffect(() => {
        setPriceStr(price.toString());
    }, [price]);

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPriceStr(e.target.value);
    };

    const handlePriceBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const newPrice = parseFloat(e.target.value);
        if (!isNaN(newPrice) && newPrice !== price) {
            onUpdate({ time, price: newPrice });
        } else {
            // Revert if invalid or unchanged
            setPriceStr(price.toString());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div>
            <label className="text-xs text-gray-400">{label}</label>
            <div className="flex gap-2 mt-1">
                <input
                    type="number"
                    value={priceStr}
                    onChange={handlePriceChange}
                    onBlur={handlePriceBlur}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#131722] border border-[#2A2E39] rounded px-2 py-1 text-xs text-[#D1D4DC] focus:border-[#2962FF] outline-none transition-colors"
                    title="Price"
                    step={price > 100 ? "0.01" : "0.00001"}
                />
            </div>
        </div>
    );
};
