// src/components/market-chart/AlertToast.tsx
import React, { useEffect } from 'react';
import { PriceAlert } from './types';

interface AlertToastProps {
    alert: PriceAlert;
    onCustomize: () => void;
    onDismiss: () => void;
}

const AlertToast: React.FC<AlertToastProps> = ({ alert, onCustomize, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    const conditionText = alert.value
        ? `${alert.condition} ${alert.value.toFixed(5)}`
        : alert.condition;

    return (
        <div
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-3 py-2.5 rounded-xl border shadow-lg"
            style={{
                background: '#131315',
                borderColor: 'rgba(196,181,240,0.12)',
                boxShadow: '0 12px 40px -8px rgba(0,0,0,0.7)',
                animation: 'alertToastIn 0.35s ease',
            }}
        >
            {/* Check icon */}
            <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(52,211,153,0.1)' }}
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            {/* Text */}
            <div>
                <div className="text-xs font-semibold text-[#e8e8e8]">Alert created</div>
                <div className="text-[10px] text-[#555] mt-0.5">
                    {alert.symbol} — {conditionText}
                </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-1 ml-2">
                <button
                    onClick={onCustomize}
                    className="px-3 py-1 rounded-md text-[10px] font-semibold transition-colors"
                    style={{
                        background: 'rgba(196,181,240,0.1)',
                        color: '#c4b5f0',
                    }}
                    onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(196,181,240,0.18)')
                    }
                    onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'rgba(196,181,240,0.1)')
                    }
                >
                    Customize
                </button>
                <button
                    onClick={onDismiss}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold text-[#444] hover:text-[#888] transition-colors"
                >
                    Dismiss
                </button>
            </div>

            <style>{`
                @keyframes alertToastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default AlertToast;
