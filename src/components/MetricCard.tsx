import React from 'react';
import { Metric } from '../types';

const MetricCard: React.FC<Metric> = ({ title, value, change, isPositive }) => {
  const changeColor = isPositive ? 'text-green-400' : 'text-red-400';
  const changeIcon = isPositive ? '▲' : '▼';

  return (
    <div className="bg-card-bg p-5 rounded-xl transition-colors hover:bg-gray-700/50">
      <h3 className="text-sm font-medium text-gray-400">{title}</h3>
      <div className="flex items-baseline justify-between mt-2">
        <p className="text-xl sm:text-2xl font-semibold text-white">{value}</p>
        {change && (
          <span className={`text-sm font-medium ${changeColor} flex items-center`}>
            {changeIcon} {change}
          </span>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
