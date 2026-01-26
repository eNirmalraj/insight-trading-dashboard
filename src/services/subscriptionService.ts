import { supabase } from './supabaseClient';
import { SubscriptionPlan, UserSubscription } from '../types/subscription';

// --- Plans ---

export const getPlans = async (): Promise<SubscriptionPlan[]> => {
    const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true }); // Free first

    if (error) throw new Error(error.message);
    return data;
};

// --- User Subscription ---

export const getUserSubscription = async (): Promise<UserSubscription | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
            *,
            plan:plan_id (*)
        `)
        .eq('user_id', user.id)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
        console.error('Error fetching subscription:', error);
    }

    return data || null;
};

// --- Mock Payment Logic ---

export const subscribeToPlan = async (planId: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Must be logged in');

    // 1. In a real app, this would call a Supabase Edge Function to create a Stripe Checkout Session
    // 2. We will Mock the success callback here by directly inserting/updating the DB.

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(now.getMonth() + 1);

    const { error } = await supabase
        .from('user_subscriptions')
        .upsert({
            user_id: user.id,
            plan_id: planId,
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            stripe_customer_id: 'cus_mock_' + user.id,
            stripe_subscription_id: 'sub_mock_' + Date.now()
        });

    if (error) throw new Error(error.message);
};

export const cancelSubscription = async (): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Must be logged in');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In real app, call Stripe. Here, update DB to 'canceled'
    // We could either delete the row (revert to free) or set status to canceled.
    // If we delete, our code needs to handle "null subscription = Free".
    // Let's set status to canceled for now.

    // Actually, usually "Canceled" means "Active until end of period". 
    // For simplicity of MVP, let's just "Downgrade immediately" by deleting the record 
    // or finding the 'Free' plan ID and switching to it.

    // Better approach for MVP: Setup logic implies "No Record" = Free? 
    // Or we should always have a record?
    // Let's go with: Always have a record if they upgraded. If they cancel, we switch them back to Free plan.

    // Find Free Plan ID
    const { data: plans } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('name', 'Free')
        .single();

    if (!plans) throw new Error('Free plan not found');

    const { error } = await supabase
        .from('user_subscriptions')
        .update({
            plan_id: plans.id,
            status: 'active', // Active on Free plan
            stripe_subscription_id: null
        })
        .eq('user_id', user.id);

    if (error) throw new Error(error.message);
};
