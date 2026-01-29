import React, { useState } from 'react';
import { AIAnalysisResult, getTradeAnalysis } from '../api';
import { SparklesIcon } from './IconComponents';

interface AIAnalysisPanelProps {
    symbol: string;
    price: number;
    strategyName: string;
    onClose?: () => void;
    onAnalysisComplete?: (result: AIAnalysisResult) => void;
}

const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({ symbol, price, strategyName, onClose, onAnalysisComplete }) => {
    const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        setLoading(true);
        setError(null);
        try {
            // Context builder: In a real backend scenario, we'd fetch extra stats here.
            // For now, we pass basic context available to the client.
            const context = {
                recentSignals: [], // No client-side signals history readily available in this context yet
                winRate: 0, // Placeholder
                indicators: { "Trend": "Neutral" } // Placeholder
            };

            const result = await getTradeAnalysis(symbol, price, strategyName, context);
            setAnalysis(result);
            if (onAnalysisComplete) {
                onAnalysisComplete(result);
            }
        } catch (err) {
            setError("Analysis failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const getDecisionColor = (d: string) => {
        switch (d) {
            case 'TAKE': return 'text-green-400 bg-green-500/10 border-green-500/50';
            case 'SKIP': return 'text-red-400 bg-red-500/10 border-red-500/50';
            case 'WAIT': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/50';
            default: return 'text-gray-400 bg-gray-500/10 border-gray-500/50';
        }
    };

    return (
        <div className="bg-[#1e1e24] border border-blue-500/30 rounded-lg p-5 w-full max-w-md shadow-2xl relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] rounded-full pointer-events-none"></div>

            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-blue-400" />
                    AI Advisory <span className="text-xs bg-blue-600 px-2 py-0.5 rounded text-white ml-2">Preview</span>
                </h3>
                {onClose && (
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                )}
            </div>

            {!analysis && !loading && !error && (
                <div className="text-center py-6">
                    <p className="text-gray-400 mb-4 text-sm">
                        Analyze <strong>{symbol}</strong> using <strong>{strategyName}</strong> strategy context.
                    </p>
                    <button
                        onClick={handleAnalyze}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-6 rounded-full transition-all shadow-lg hover:shadow-blue-500/25"
                    >
                        Analyze Trade
                    </button>
                    <p className="text-xs text-gray-500 mt-4">
                        *AI analysis is advisory only. Do not rely solely on this for financial decisions.
                    </p>
                </div>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-blue-400 animate-pulse text-sm">Analyzing market structure...</p>
                </div>
            )}

            {error && (
                <div className="text-center py-6">
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={handleAnalyze} className="text-sm text-gray-300 underline hover:text-white">Try Again</button>
                </div>
            )}

            {analysis && (
                <div className="animate-fade-in space-y-4">
                    <div className={`flex items-center justify-between p-3 rounded-lg border ${getDecisionColor(analysis.decision)}`}>
                        <div>
                            <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Recommendation</span>
                            <span className="text-2xl font-black tracking-tight">{analysis.decision}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-gray-400 uppercase tracking-wider block mb-1">Confidence</span>
                            <span className="text-xl font-bold">{analysis.confidence}%</span>
                        </div>
                    </div>

                    <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                        <p className="text-gray-300 text-sm leading-relaxed">
                            {analysis.explanation}
                        </p>
                    </div>

                    {analysis.riskFactors.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Risk Factors</h4>
                            <ul className="space-y-1">
                                {analysis.riskFactors.map((risk, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-xs text-gray-400">
                                        <span className="text-red-500 mt-0.5">⚠️</span>
                                        {risk}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <button
                        onClick={() => setAnalysis(null)}
                        className="w-full mt-2 py-2 text-xs text-gray-500 hover:text-white transition-colors"
                    >
                        Reset Analysis
                    </button>
                </div>
            )}
        </div>
    );
};

export default AIAnalysisPanel;
