
import React from 'react';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BalanceHistoryData } from '../constants';

interface AccountPerformanceChartProps {
    data: BalanceHistoryData[];
    lineColor: string;
    gradientId: string;
}

const AccountPerformanceChart: React.FC<AccountPerformanceChartProps> = ({ data, lineColor, gradientId }) => {
    if (!data || data.length === 0) {
        return (
            <div className="bg-card-bg p-5 rounded-xl h-80 flex items-center justify-center">
                <p className="text-gray-500">No performance data available.</p>
            </div>
        );
    }
    
    return (
        <div className="bg-card-bg p-5 rounded-xl">
            <h2 className="text-xl font-semibold text-white mb-4">Equity / Balance Curve</h2>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={lineColor} stopOpacity={0.4}/>
                                <stop offset="95%" stopColor={lineColor} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3F3F3F" />
                        <XAxis dataKey="date" stroke="#A9A9A9" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#A9A9A9" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 500', 'dataMax + 500']} tickFormatter={(value: number) => `$${(value/1000).toFixed(0)}k`} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1F1F1F', border: '1px solid #3F3F3F', borderRadius: '0.75rem' }}
                            labelStyle={{ color: '#EAEAEA' }}
                            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Balance']}
                        />
                        <Area type="monotone" dataKey="balance" stroke={lineColor} strokeWidth={2} fill={`url(#${gradientId})`} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default AccountPerformanceChart;
