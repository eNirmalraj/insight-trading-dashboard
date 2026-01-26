

import React, { useState, useMemo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CameraIcon } from '../components/IconComponents';
import { DailyTradeSummary } from '../constants';

// Helper to format date to 'YYYY-MM-DD'
const toISODateString = (date: Date) => date.toISOString().split('T')[0];

const DailySummary: React.FC<{ tradeHistory?: DailyTradeSummary[] }> = ({ tradeHistory = [] }) => {
    // Set a fixed date to match the screenshot
    const [displayDate, setDisplayDate] = useState(new Date('2025-09-13T12:00:00Z'));
    const today = new Date('2025-09-13T12:00:00Z');

    const tradeDataByDate = useMemo(() => {
        const map = new Map<string, { pnl: number; trades: number }>();
        tradeHistory.forEach(trade => {
            map.set(trade.date, { pnl: trade.pnl, trades: trade.trades });
        });
        return map;
    }, [tradeHistory]);

    const { calendarGrid, monthPnl, monthTradingDays } = useMemo(() => {
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        
        const days = [];
        let monthPnl = 0;
        let monthTradingDays = 0;

        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday
        const prevMonthLastDay = new Date(year, month, 0);
        for (let i = startDayOfWeek; i > 0; i--) {
            const date = new Date(prevMonthLastDay);
            date.setDate(prevMonthLastDay.getDate() - i + 1);
            days.push({ date, isCurrentMonth: false });
        }

        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const date = new Date(year, month, i);
            days.push({ date, isCurrentMonth: true });
            const tradeData = tradeDataByDate.get(toISODateString(date));
            if (tradeData) {
                monthPnl += tradeData.pnl;
                monthTradingDays++;
            }
        }

        const endDayOfWeek = lastDayOfMonth.getDay();
        if (endDayOfWeek < 6) { // if it's not Saturday
            const nextMonthFirstDay = new Date(year, month + 1, 1);
            for (let i = 1; i < 7 - endDayOfWeek; i++) {
                const date = new Date(nextMonthFirstDay);
                date.setDate(nextMonthFirstDay.getDate() + i - 1);
                days.push({ date, isCurrentMonth: false });
            }
        }
        
        return { calendarGrid: days, monthPnl, monthTradingDays };
    }, [displayDate, tradeDataByDate]);

    const weeklySummaries = useMemo(() => {
        const weeks: { range: string; pnl: number; days: number }[] = [];
        for (let i = 0; i < calendarGrid.length; i += 7) {
            const weekSlice = calendarGrid.slice(i, i + 7);
            if (weekSlice.length === 0) continue;

            const weekData = weekSlice.reduce((acc, day) => {
                const tradeInfo = tradeDataByDate.get(toISODateString(day.date));
                if (tradeInfo) {
                    acc.pnl += tradeInfo.pnl;
                    acc.days++;
                }
                return acc;
            }, { pnl: 0, days: 0 });
            
            const start = weekSlice[0].date;
            const end = weekSlice[weekSlice.length - 1].date;
            const range = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            
            weeks.push({ range, ...weekData });
        }
        // Match screenshot week names
        const weekNames = ["One", "Two", "Three", "Four", "Five", "Six"];
        return weeks.map((week, index) => ({...week, name: `Week ${weekNames[index]}`}));
    }, [calendarGrid, tradeDataByDate]);

    const changeMonth = (delta: number) => {
        setDisplayDate(current => {
            const newDate = new Date(current);
            newDate.setMonth(newDate.getMonth() + delta);
            return newDate;
        });
    };

    const goToToday = () => setDisplayDate(new Date());

    const isSameDay = (d1: Date, d2: Date) => toISODateString(d1) === toISODateString(d2);

    return (
        <div className="p-6 text-gray-300 bg-gray-900" style={{'backgroundColor':'#1A222C'}}>
            <header className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-white">Daily Summary</h1>
                <div className="flex items-center gap-4">
                    <div className="bg-gray-800 p-2 px-4 rounded-lg flex items-center gap-4 text-sm">
                        <span className="text-gray-400">PnL:</span>
                        <span className={`font-semibold ${monthPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {monthPnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </span>
                    </div>
                     <div className="bg-gray-800 p-2 px-4 rounded-lg flex items-center gap-4 text-sm">
                        <span className="text-gray-400">Days:</span>
                        <span className="font-semibold text-white">{monthTradingDays}</span>
                    </div>
                    <button className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                        <CameraIcon className="w-4 h-4" />
                        Share
                    </button>
                </div>
            </header>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Calendar */}
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <button onClick={() => changeMonth(-1)} className="p-1 rounded-md hover:bg-gray-700"><ChevronLeftIcon className="w-5 h-5" /></button>
                            <h2 className="text-lg font-semibold text-white w-36 text-center">{displayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
                            <button onClick={() => changeMonth(1)} className="p-1 rounded-md hover:bg-gray-700"><ChevronRightIcon className="w-5 h-5" /></button>
                        </div>
                        <button onClick={goToToday} className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-1.5 px-4 rounded-lg text-sm">Today</button>
                    </div>

                    <div className="grid grid-cols-7 gap-px" style={{'backgroundColor':'#394B61'}}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center py-2 text-xs font-semibold text-gray-400" style={{'backgroundColor':'#1A222C'}}>{day}</div>
                        ))}
                        {calendarGrid.map(({ date, isCurrentMonth }) => {
                            const dateString = toISODateString(date);
                            const tradeData = tradeDataByDate.get(dateString);
                            const isTodayDate = isSameDay(date, today);
                            const pnlColor = tradeData && tradeData.pnl >= 0 ? 'text-green-400' : 'text-red-400';
                            
                            return (
                                <div
                                    key={dateString}
                                    className={`p-2 h-24 flex flex-col relative ${isCurrentMonth ? '' : 'text-gray-600'} ${isTodayDate ? 'border-2 border-gray-400 rounded-md' : ''} ${tradeData ? 'bg-green-500/10' : ''}`}
                                    style={{'backgroundColor':'#1A222C'}}
                                >
                                    <span className="self-start font-medium">{date.getDate()}</span>
                                    {tradeData && isCurrentMonth && (
                                        <div className="mt-auto text-xs">
                                            <p>{tradeData.trades} trade{tradeData.trades > 1 ? 's' : ''}</p>
                                            <p className={`font-semibold ${pnlColor}`}>{tradeData.pnl >=0 && '+'}{tradeData.pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Weekly Summary */}
                <div className="w-full md:w-72 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-white mb-4">Weekly Summary</h3>
                    <div className="space-y-3">
                        {weeklySummaries.map(week => (
                            <div key={week.name} className="p-3 rounded-lg bg-gray-800 border-l-4 border-gray-700">
                                <div className="flex justify-between items-baseline">
                                    <h4 className="font-bold text-white">{week.name}</h4>
                                    <p className="text-xs text-gray-400">{week.range}</p>
                                </div>
                                {week.days > 0 ? (
                                    <div className="flex justify-between items-baseline mt-2 text-sm">
                                        <div>
                                            <span className="text-gray-400">PnL: </span>
                                            <span className={`font-semibold ${week.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{week.pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                                        </div>
                                        <div>
                                             <span className="text-gray-400">Days: </span>
                                             <span className="font-semibold text-white">{week.days}</span>
                                        </div>
                                    </div>
                                ) : (
                                     <p className="text-sm text-gray-500 mt-2">No trades</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DailySummary;
