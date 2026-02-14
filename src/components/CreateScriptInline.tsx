import { useState, useEffect } from "react";
import { CloseIcon } from './IconComponents';
import { AVAILABLE_STRATEGIES } from '../constants';
import { AccountType } from '../types';
import * as api from '../api';

interface PaperAccount {
    id: string;
    name: string;
    broker: 'Crypto' | 'Forex' | 'Indian';
    balance: number;
    currency: string;
}

interface CreateScriptInlineProps {
    onCreate: (name: string, type: AccountType, strategy: string, tradingMode: 'paper' | 'live') => void;
    onCancel: () => void;
}

export default function CreateScriptInline({ onCreate, onCancel }: CreateScriptInlineProps) {
    const [step, setStep] = useState("choose"); // choose | form
    const [paperAccounts, setPaperAccounts] = useState<PaperAccount[]>([]);
    const [customStrategies, setCustomStrategies] = useState<string[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

    const [form, setForm] = useState({
        name: "",
        mode: "Paper",
        account: "Demo",
        market: "Crypto",
        strategy: "Trend",
    });

    // Load paper trading accounts and strategies when component mounts
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setIsLoadingAccounts(true);
            const [accounts, strategies] = await Promise.all([
                api.getPaperTradingAccounts(),
                api.getStrategies()
            ]);

            setPaperAccounts(accounts);

            // Filter custom strategies and extract names
            // Assuming strategies have type 'STRATEGY' or similar for custom ones
            // and we want to list their names.
            const customNames = strategies
                .filter((s: any) => s.type === 'STRATEGY' || s.type === 'KURI') // Adjust type check based on Strategy definition
                .map((s: any) => s.name);

            setCustomStrategies(customNames);

            // Set first account as default if available
            if (accounts.length > 0 && form.mode === "Paper") {
                const filteredAccounts = accounts.filter(acc => acc.broker === form.market);
                if (filteredAccounts.length > 0) {
                    handleChange("account", filteredAccounts[0].name);
                }
            }
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setIsLoadingAccounts(false);
        }
    };


    // ---------- FUNCTIONS ----------

    const handleChange = (field: string, value: string) => {
        setForm(prev => {
            const updated = { ...prev, [field]: value };

            // If market changes in paper mode, auto-select first matching account
            if (field === "market" && updated.mode === "Paper") {
                const filteredAccounts = paperAccounts.filter(acc => acc.broker === value);
                if (filteredAccounts.length > 0) {
                    updated.account = filteredAccounts[0].name;
                } else {
                    updated.account = ""; // No accounts for this market
                }
            }

            return updated;
        });
    };

    const chooseMode = (mode: string) => {
        handleChange("mode", mode);

        // When switching to paper mode, set first account if available
        if (mode === "Paper" && paperAccounts.length > 0) {
            const filteredAccounts = paperAccounts.filter(acc => acc.broker === form.market);
            if (filteredAccounts.length > 0) {
                setForm(prev => ({ ...prev, account: filteredAccounts[0].name }));
            }
        } else if (mode === "Live") {
            // Reset to default live account
            setForm(prev => ({ ...prev, account: "Demo" }));
        }

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
    };

    // ---------- UI ----------

    return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl mb-6">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-700">
                <h3 className="text-lg font-semibold text-white">Create New Script</h3>
            </div>

            {/* STEP 1 — Choose Mode */}
            {step === "choose" && (
                <div className="p-6">
                    <h4 className="text-white font-medium mb-4">Select Mode</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => chooseMode("Paper")}
                            className="p-8 bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-700 hover:border-zinc-600 rounded-xl transition text-white text-lg font-medium"
                        >
                            Paper Trading
                        </button>
                        <button
                            onClick={() => chooseMode("Live")}
                            className="p-8 bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-700 hover:border-zinc-600 rounded-xl transition text-white text-lg font-medium"
                        >
                            Live Trading
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2 — Form */}
            {step === "form" && (
                <div className="p-6">
                    <div className="mb-4 text-sm text-gray-400">
                        Mode: <span className="text-white font-semibold">{form.mode}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* Script Name */}
                        <div>
                            <label className="block text-white font-medium mb-2 text-sm">Script Name</label>
                            <input
                                className="w-full px-4 py-2.5 bg-zinc-800 border-2 border-yellow-500 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                                value={form.name}
                                onChange={e => handleChange("name", e.target.value)}
                                placeholder="Enter script name"
                            />
                        </div>

                        {/* Market */}
                        <div>
                            <label className="block text-white font-medium mb-2 text-sm">Market</label>
                            <select
                                className="w-full px-4 py-2.5 bg-zinc-800 border-2 border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                                value={form.market}
                                onChange={e => handleChange("market", e.target.value)}
                            >
                                <option>Crypto</option>
                                <option>Forex</option>
                                <option>Indian</option>
                            </select>
                        </div>

                        {/* Account */}
                        <div>
                            <label className="block text-white font-medium mb-2 text-sm">Account</label>
                            <select
                                className="w-full px-4 py-2.5 bg-zinc-800 border-2 border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                                value={form.account}
                                onChange={e => handleChange("account", e.target.value)}
                                disabled={isLoadingAccounts}
                            >
                                {form.mode === "Paper" ? (
                                    // Show paper trading accounts filtered by market
                                    paperAccounts
                                        .filter(acc => acc.broker === form.market)
                                        .length > 0 ? (
                                        paperAccounts
                                            .filter(acc => acc.broker === form.market)
                                            .map(acc => (
                                                <option key={acc.id} value={acc.name}>
                                                    {acc.name} ({acc.currency} {acc.balance.toLocaleString()})
                                                </option>
                                            ))
                                    ) : (
                                        <option value="">No {form.market} accounts - Create one in Settings</option>
                                    )
                                ) : (
                                    // Show live accounts
                                    <>
                                        <option>Demo</option>
                                        <option>Binance</option>
                                        <option>Broker X</option>
                                    </>
                                )}
                            </select>
                        </div>

                        {/* Strategy */}
                        <div>
                            <label className="block text-white font-medium mb-2 text-sm">Strategy</label>
                            <select
                                className="w-full px-4 py-2.5 bg-zinc-800 border-2 border-zinc-700 rounded-lg text-white focus:outline-none focus:border-zinc-600"
                                value={form.strategy}
                                onChange={e => handleChange("strategy", e.target.value)}
                            >
                                <optgroup label="Built-in Strategies">
                                    {AVAILABLE_STRATEGIES.map(strat => (
                                        <option key={`builtin-${strat}`} value={strat}>{strat}</option>
                                    ))}
                                </optgroup>

                                {customStrategies.length > 0 && (
                                    <optgroup label="My Strategies">
                                        {customStrategies.map(strat => (
                                            <option key={`custom-${strat}`} value={strat}>{strat}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-zinc-700">
                        <button
                            onClick={() => setStep("choose")}
                            className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white font-medium transition"
                        >
                            Back
                        </button>
                        <button
                            onClick={submit}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition"
                        >
                            Create
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
