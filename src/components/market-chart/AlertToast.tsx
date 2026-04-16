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
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{
                background: 'linear-gradient(135deg, rgba(30,28,40,0.92), rgba(18,16,26,0.96))',
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                border: '1px solid rgba(167,139,250,0.15)',
                boxShadow: '0 0 60px -15px rgba(167,139,250,0.15), 0 20px 50px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
                animation: 'alertToastIn 0.35s ease',
            }}
        >
            {/* Check icon */}
            <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                    background: 'linear-gradient(135deg, rgba(167,139,250,0.15), rgba(139,92,246,0.1))',
                    boxShadow: '0 0 12px -4px rgba(167,139,250,0.2)',
                }}
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="2.5"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            {/* Text */}
            <div>
                <div className="text-xs font-semibold text-white">Alert created</div>
                <div className="text-[10px] text-[rgba(167,139,250,0.6)] mt-0.5">
                    {alert.symbol} — {conditionText}
                </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-1.5 ml-3">
                <button
                    onClick={onCustomize}
                    className="px-4 py-1.5 rounded-xl text-[10px] font-semibold text-white transition-all"
                    style={{
                        background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                        boxShadow: '0 4px 16px -4px rgba(139,92,246,0.4)',
                    }}
                    onMouseEnter={(e) =>
                        (e.currentTarget.style.boxShadow = '0 4px 20px -4px rgba(139,92,246,0.6)')
                    }
                    onMouseLeave={(e) =>
                        (e.currentTarget.style.boxShadow = '0 4px 16px -4px rgba(139,92,246,0.4)')
                    }
                >
                    Customize
                </button>
                <button
                    onClick={onDismiss}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-semibold text-[#555] hover:text-[#a78bfa] transition-colors"
                >
                    Dismiss
                </button>
            </div>

            <style>{`
                @keyframes alertToastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
};

export default AlertToast;
