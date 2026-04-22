import React from 'react';

export type LineStyleOption = 'solid' | 'dashed' | 'dotted';

interface LineStyleSelectProps {
    value: LineStyleOption;
    onChange: (value: LineStyleOption) => void;
    disabled?: boolean;
}

const LineStyleSelect: React.FC<LineStyleSelectProps> = ({ value, onChange, disabled }) => (
    <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LineStyleOption)}
        className="bg-gray-700 border border-gray-600 rounded-md py-1 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
    </select>
);

export default LineStyleSelect;
