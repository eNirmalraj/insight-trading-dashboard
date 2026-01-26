// src/context/AuthContext.tsx
// React context for authentication state management

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as authService from '../services/authService';

// Types
interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    signIn: (email: string, password: string) => Promise<authService.AuthResult>;
    signUp: (email: string, password: string) => Promise<authService.AuthResult>;
    signOut: () => Promise<void>;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize auth state
    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                // Race getSession with a 5s timeout to prevent hanging
                const sessionPromise = authService.getSession();
                const timeoutPromise = new Promise<Session | null>((resolve) =>
                    setTimeout(() => {
                        console.warn('Auth initialization timed out, defaulting to null');
                        resolve(null);
                    }, 10000)
                );

                const session = await Promise.race([sessionPromise, timeoutPromise]);

                if (mounted && session) {
                    setUser(session.user);
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        };

        initAuth();

        // Subscribe to auth changes
        const unsubscribe = authService.onAuthStateChange((event, session) => {
            if (mounted) {
                if (event === 'SIGNED_IN' && session) {
                    setUser(session.user);
                } else if (event === 'SIGNED_OUT') {
                    setUser(null);
                }
            }
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);

    // Sign in handler
    const handleSignIn = useCallback(async (email: string, password: string) => {
        const result = await authService.signIn(email, password);
        if (result.success && result.user) {
            setUser(result.user);
        }
        return result;
    }, []);

    // Sign up handler
    const handleSignUp = useCallback(async (email: string, password: string) => {
        const result = await authService.signUp(email, password);
        if (result.success && result.user) {
            setUser(result.user);
        }
        return result;
    }, []);

    // Sign out handler
    const handleSignOut = useCallback(async () => {
        await authService.signOut();
        setUser(null);
    }, []);

    const value: AuthContextType = {
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
