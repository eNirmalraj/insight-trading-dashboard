import React, { useState, useEffect } from 'react';
import { getPlans, getUserSubscription, subscribeToPlan, cancelSubscription } from '../services/subscriptionService';
import { SubscriptionPlan, UserSubscription } from '../types/subscription';
import Loader from '../components/Loader';
import { StarIcon, CheckIcon, CheckCircleIcon } from '../components/IconComponents';

const Subscription: React.FC = () => {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [plansData, subData] = await Promise.all([
                getPlans(),
                getUserSubscription()
            ]);
            setPlans(plansData);
            setCurrentSubscription(subData);
        } catch (err) {
            console.error('Failed to load subscription data', err);
            setError('Failed to load plans.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubscribe = async (plan: SubscriptionPlan) => {
        setIsProcessing(true);
        setError(null);
        try {
            await subscribeToPlan(plan.id);
            // Reload to reflect changes
            await loadData();
        } catch (err: any) {
            console.error('Subscription failed', err);
            setError(err.message || 'Subscription failed');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to cancel your Pro subscription? You will lose access to advanced features.')) return;

        setIsProcessing(true);
        setError(null);
        try {
            await cancelSubscription();
            await loadData();
        } catch (err: any) {
            console.error('Cancellation failed', err);
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const isCurrentPlan = (planId: string) => {
        if (!currentSubscription) return false;
        return currentSubscription.plan_id === planId;
    };

    if (isLoading) return <Loader />;

    return (
        <div className="h-full bg-[#18181b] overflow-y-auto p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-white mb-4">Choose Your Plan</h1>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                        Unlock the full potential of Insight Trading with our Pro plan.
                        Automate strategies, follow experts, and access premium tools.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg mb-8 text-center">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    {plans.map(plan => {
                        const isPro = plan.name === 'Pro';
                        const isCurrent = isCurrentPlan(plan.id);

                        return (
                            <div
                                key={plan.id}
                                className={`relative rounded-2xl p-8 flex flex-col transition-all duration-300 ${isPro
                                    ? 'bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-blue-500/30 ring-1 ring-blue-500/20 shadow-2xl shadow-blue-900/10'
                                    : 'bg-[#202024] border border-gray-700'
                                    }`}
                            >
                                {isPro && (
                                    <div className="absolute top-0 right-0 left-0 -mt-4 flex justify-center">
                                        <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
                                            Most Popular
                                        </span>
                                    </div>
                                )}

                                <div className="mb-6">
                                    <h3 className={`text-xl font-bold mb-2 ${isPro ? 'text-white' : 'text-gray-300'}`}>
                                        {plan.name}
                                    </h3>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-4xl font-bold text-white">${plan.price_monthly}</span>
                                        <span className="text-gray-500">/month</span>
                                    </div>
                                </div>

                                <div className="flex-1 space-y-4 mb-8">
                                    {plan.features.map((feature, idx) => (
                                        <div key={idx} className="flex items-start gap-3">
                                            <div className={`mt-1 p-0.5 rounded-full ${isPro ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                                                <CheckIcon className="w-3 h-3" />
                                            </div>
                                            <span className="text-gray-300 text-sm">{feature}</span>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => handleSubscribe(plan)}
                                    disabled={isCurrent || isProcessing}
                                    className={`w-full py-3 px-6 rounded-lg font-bold transition-all duration-200 ${isCurrent
                                        ? 'bg-gray-700 text-gray-400 cursor-default'
                                        : isPro
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]'
                                            : 'bg-white/10 hover:bg-white/20 text-white active:scale-[0.98]'
                                        }`}
                                >
                                    {isProcessing ? 'Processing...' : (
                                        isCurrent ? 'Current Plan' : (isPro ? 'Upgrade to Pro' : 'Downgrade to Free')
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Cancel Link */}
                {currentSubscription && currentSubscription.plan && currentSubscription.plan.name === 'Pro' && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={handleCancel}
                            disabled={isProcessing}
                            className="text-gray-500 hover:text-red-400 text-sm underline transition-colors"
                        >
                            Cancel Subscription
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Subscription;
