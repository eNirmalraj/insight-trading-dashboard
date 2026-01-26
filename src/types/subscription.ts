export interface SubscriptionPlan {
    id: string;
    name: 'Free' | 'Pro';
    price_monthly: number;
    features: string[];
    stripe_price_id: string | null;
    is_active: boolean;
}

export interface UserSubscription {
    user_id: string;
    plan_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
    current_period_start: string;
    current_period_end: string;
    plan?: SubscriptionPlan; // Joined
}
