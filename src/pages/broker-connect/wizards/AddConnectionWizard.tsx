import React, { useState } from 'react';
import { BROKERS, Category } from '../brokerMeta';
import { BrokerId } from '../../../services/brokerCredentialService';
import BrokerIcon from '../components/BrokerIcon';
import CryptoCredentialForm from './CryptoCredentialForm';
import MT5CredentialForm from './MT5CredentialForm';
import IndianBrokerForm from './IndianBrokerForm';

interface Props {
    onClose: () => void;
    onAdded: () => void;
}

const CATEGORY_LABELS: Record<Category, string> = {
    crypto: 'Crypto Exchange',
    forex: 'Forex (MetaTrader 5)',
    indian: 'Indian Broker',
};

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
    crypto: 'Binance, Bitget — spot and futures trading',
    forex: 'MT5 broker account via MetaAPI',
    indian: 'Zerodha, Angel One, Upstox, Dhan, Fyers',
};

const AddConnectionWizard: React.FC<Props> = ({ onClose, onAdded }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [category, setCategory] = useState<Category | null>(null);
    const [broker, setBroker] = useState<BrokerId | null>(null);

    const brokersInCategory = category
        ? Object.values(BROKERS).filter((b) => b.category === category)
        : [];

    const title = step === 1
        ? 'Add Connection · Choose Category'
        : step === 2
            ? `Choose ${CATEGORY_LABELS[category!]}`
            : `${BROKERS[broker!].name} Credentials`;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-[#18181b] rounded-xl w-full max-w-md border border-gray-700 shadow-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="text-gray-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                {step === 1 && (
                    <div className="space-y-2">
                        {(['crypto', 'forex', 'indian'] as Category[]).map((c) => (
                            <button
                                type="button"
                                key={c}
                                onClick={() => { setCategory(c); setStep(2); }}
                                className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-left text-white transition-colors"
                            >
                                <div className="font-semibold">{CATEGORY_LABELS[c]}</div>
                                <div className="text-xs text-gray-400 mt-1">{CATEGORY_DESCRIPTIONS[c]}</div>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-2">
                        {brokersInCategory.map((b) => (
                            <button
                                type="button"
                                key={b.id}
                                onClick={() => { setBroker(b.id); setStep(3); }}
                                className="w-full p-3 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-3 text-left text-white transition-colors"
                            >
                                <BrokerIcon broker={b.id} size="sm" />
                                <span className="font-semibold">{b.name}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => { setCategory(null); setStep(1); }}
                            className="text-xs text-gray-400 hover:text-gray-300"
                        >
                            ← Back
                        </button>
                    </div>
                )}

                {step === 3 && broker && category === 'crypto' && (
                    <CryptoCredentialForm
                        broker={broker as 'binance' | 'bitget'}
                        onCancel={() => { setBroker(null); setStep(2); }}
                        onSaved={onAdded}
                    />
                )}
                {step === 3 && broker && category === 'forex' && (
                    <MT5CredentialForm
                        onCancel={() => { setBroker(null); setStep(2); }}
                        onSaved={onAdded}
                    />
                )}
                {step === 3 && broker && category === 'indian' && (
                    <IndianBrokerForm
                        broker={broker as 'zerodha' | 'angelone' | 'upstox' | 'dhan' | 'fyers'}
                        onCancel={() => { setBroker(null); setStep(2); }}
                        onSaved={onAdded}
                    />
                )}
            </div>
        </div>
    );
};

export default AddConnectionWizard;
