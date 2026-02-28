// src/hooks/useAlerts.ts

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

export interface Alert {
    id: string;
    signal_id?: string;
    type: string;
    message: string;
    created_at: string;
    user_id?: string;
    read: boolean;
}

export const useAlerts = (userId?: string | null) => {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = useCallback(async () => {
        if (!userId) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('alerts')
                .select('*')
                // .or(`user_id.eq.${userId},user_id.is.null`) // Fetch user specific + system broadcast
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            // Only keep alerts for this user or system broadcasts (handled via RLS usually)
            setAlerts(data as Alert[]);
            setUnreadCount(data.filter((a: Alert) => !a.read).length);
        } catch (e) {
            console.error('Failed to fetch alerts:', e);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchAlerts();

        if (!userId) return;

        // Subscribe to real-time inserted alerts
        const channel = supabase
            .channel('alerts_channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'alerts',
                    // Note: In Supabase, you can't filter by OR easily in channel subscriptions.
                    // Instead, filter client-side or assume RLS handles it.
                    // RLS won't filter real-time events for unauthenticated channels by default 
                    // unless configured properly. We'll filter client-side just in case.
                },
                (payload) => {
                    const newAlert = payload.new as Alert;

                    if (newAlert.user_id === userId || newAlert.user_id === null) {
                        setAlerts(prev => [newAlert, ...prev].slice(0, 50));
                        if (!newAlert.read) {
                            setUnreadCount(prev => prev + 1);
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, fetchAlerts]);

    const markAsRead = async (alertId: string) => {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
        setUnreadCount(prev => Math.max(0, prev - 1));

        try {
            await supabase
                .from('alerts')
                .update({ read: true })
                .eq('id', alertId);
        } catch (e) {
            console.error('Failed to mark alert as read:', e);
        }
    };

    const markAllAsRead = async () => {
        if (!userId) return;

        setAlerts(prev => prev.map(a => ({ ...a, read: true })));
        setUnreadCount(0);

        try {
            await supabase
                .from('alerts')
                .update({ read: true })
                .eq('read', false)
                .or(`user_id.eq.${userId},user_id.is.null`);
        } catch (e) {
            console.error('Failed to mark all as read:', e);
        }
    };

    return {
        alerts,
        unreadCount,
        loading,
        fetchAlerts,
        markAsRead,
        markAllAsRead
    };
};
