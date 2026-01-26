import React, { useState, useRef } from 'react';
import { ChevronDownIcon } from './IconComponents';
import { useOutsideAlerter } from './market-chart/hooks';

interface CustomSelectProps {
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
  label: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ options, selected, onSelect, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useOutsideAlerter(wrapperRef, () => setIsOpen(false));

  const handleSelect = (option: string) => {
    onSelect(option);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="text-sm font-medium text-gray-400 mb-2 block">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg p-2.5 text-sm text-white text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span>{selected}</span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto scrollbar-hide">
          <ul className="py-1">
            {options.map(option => (
              <li
                key={option}
                onClick={() => handleSelect(option)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  selected === option ? 'bg-blue-500 text-white' : 'hover:bg-gray-600 text-gray-300'
                }`}
              >
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
