import { useState } from "react";
import { CloseIcon } from './IconComponents';
import { AccountType } from '../types';
import { AVAILABLE_STRATEGIES } from '../constants';

interface CreateWatchlistModalProps {
    onClose: () => void;
    onCreate: (name: string, type: AccountType, strategy: string, tradingMode: 'paper' | 'live') => void;
}

export default function CreateWatchlistModal({ onClose, onCreate }: CreateWatchlistModalProps) {
    const [step, setStep] = useState("choose"); // choose | form

    const [form, setForm] = useState({
        name: "",
        mode: "Paper",
        account: "Demo",
        market: "Crypto",
        strategy: "Trend",
    });

    // ---------- FUNCTIONS ----------

    const handleChange = (field: string, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const chooseMode = (mode: string) => {
        handleChange("mode", mode);
        setStep("form");
    };

    const submit = () => {
        if (!form.name) {
            alert("Enter script name");
            return;
        }

        console.log("SCRIPT CREATED:", form);

        // Convert form data to expected format
        const accountType = form.market as AccountType;
        const tradingMode = form.mode === "Paper" ? "paper" : "live";

        onCreate(form.name, accountType, form.strategy, tradingMode as 'paper' | 'live');

        // Reset form
        setForm({
            name: "",
            mode: "Paper",
            account: "Demo",
            market: "Crypto",
            strategy: "Trend",
        });
        setStep("choose");
        onClose();
    };

    // ---------- UI ----------

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onPointerDown={e => e.currentTarget === e.target && onClose()}
        >
            <div
                className="w-full max-w-4xl bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-2xl shadow-2xl z-50"
                onPointerDown={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-700">
                    <h2 className="text-xl font-bold text-white">Create New Script</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* STEP 1 — Choose Mode */}
                {step === "choose" && (
                    <div className="p-8">
                        <h3 className="text-lg font-semibold text-white mb-6">Select Mode</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <button
                                onClick={() => chooseMode("Paper")}
                                className="p-12 bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-700 hover:border-zinc-600 rounded-2xl transition text-white text-xl font-medium"
                            >
                                Paper Trading
                            </button>
                            <button
                                onClick={() => chooseMode("Live")}
                                className="p-12 bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-700 hover:border-zinc-600 rounded-2xl transition text-white text-xl font-medium"
                            >
                                Live Trading
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 2 — Form */}
                {step === "form" && (
                    <div className="p-8">
                        <div className="mb-6 text-sm text-gray-400">
                            Mode: <span className="text-white font-semibold">{form.mode}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8">
                            {/* Script Name */}
                            <div>
                                <label className="block text-white font-medium mb-2">Script Name</label>
                                <input
                                    className="w-full px-4 py-3 bg-zinc-800 border-2 border-yellow-500 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                                    value={form.name}
                                    onChange={e => handleChange("name", e.target.value)}
                                    placeholder="Enter script name"
                                />
                            </div>

                            {/* Account */}
                            <div>
                                <label className="block text-white font-medium mb-2">Account</label>
                                <select
                                    className="w-full px-4 py-3 bg-zinc-800 border-2 border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                                    value={form.account}
                                    onChange={e => handleChange("account", e.target.value)}
                                >
                                    <option>Demo</option>
                                    <option>Binance</option>
                                    <option>Broker X</option>
                                </select>
                            </div>

                            {/* Market */}
                            <div>
                                <label className="block text-white font-medium mb-2">Market</label>
                                <select
                                    className="w-full px-4 py-3 bg-zinc-800 border-2 border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                                    value={form.market}
                                    onChange={e => handleChange("market", e.target.value)}
                                >
                                    <option>Crypto</option>
                                    <option>Forex</option>
                                    <option>Indian</option>
                                </select>
                            </div>

                            {/* Strategy */}
                            <div>
                                <label className="block text-white font-medium mb-2">Strategy</label>
                                <select
                                    className="w-full px-4 py-3 bg-zinc-800 border-2 border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                                    value={form.strategy}
                                    onChange={e => handleChange("strategy", e.target.value)}
                                >
                                    <option>Trend</option>
                                    <option>Scalp</option>
                                    <option>Breakout</option>
                                    {AVAILABLE_STRATEGIES.map(strat => (
                                        <option key={strat} value={strat}>{strat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep("choose")}
                                className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-medium transition"
                            >
                                Back
                            </button>
                            <button
                                onClick={submit}
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
