// src/components/ProtectedRoute.tsx
// Protected route wrapper component

import React from 'react';
import * as ReactRouterDOM from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

// Loading spinner component
const LoadingSpinner: React.FC = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-400 text-sm">Loading...</p>
        </div>
    </div>
);

/**
 * ProtectedRoute component
 * - Shows loading spinner while auth is resolving
 * - Redirects to /signin if not authenticated
 * - Renders children if authenticated
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();

    // Show loading while auth is being determined
    if (isLoading) {
        return <LoadingSpinner />;
    }

    // Redirect to signin if not authenticated
    if (!isAuthenticated) {
        return <ReactRouterDOM.Navigate to="/signin" replace />;
    }

    // Render protected content
    return <>{children}</>;
};

/**
 * PublicOnlyRoute component
 * - Prevents authenticated users from accessing certain pages (like signin)
 * - Redirects to home if already authenticated
 */
export const PublicOnlyRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();

    // Show loading while auth is being determined
    if (isLoading) {
        return <LoadingSpinner />;
    }

    // Redirect to home if already authenticated
    if (isAuthenticated) {
        return <ReactRouterDOM.Navigate to="/" replace />;
    }

    // Render public content
    return <>{children}</>;
};

export default ProtectedRoute;
