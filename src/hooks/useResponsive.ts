import { useState, useEffect } from 'react';
import { BREAKPOINTS } from '../constants/breakpoints';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface ResponsiveState {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isXl: boolean;
    deviceType: DeviceType;
    width: number;
}

/**
 * Hook to detect current responsive breakpoint and device type
 * @returns ResponsiveState with current device information
 */
export const useResponsive = (): ResponsiveState => {
    const getDeviceType = (width: number): DeviceType => {
        if (width < BREAKPOINTS.tablet) return 'mobile';
        if (width < BREAKPOINTS.desktop) return 'tablet';
        return 'desktop';
    };

    const [state, setState] = useState<ResponsiveState>(() => {
        const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
        return {
            width,
            isMobile: width < BREAKPOINTS.tablet,
            isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
            isDesktop: width >= BREAKPOINTS.desktop,
            isXl: width >= BREAKPOINTS.xl,
            deviceType: getDeviceType(width),
        };
    });

    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            setState({
                width,
                isMobile: width < BREAKPOINTS.tablet,
                isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
                isDesktop: width >= BREAKPOINTS.desktop,
                isXl: width >= BREAKPOINTS.xl,
                deviceType: getDeviceType(width),
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return state;
};
