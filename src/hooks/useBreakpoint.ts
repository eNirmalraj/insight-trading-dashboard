import { useState, useEffect } from 'react';
import { BREAKPOINTS, BreakpointKey } from '../constants/breakpoints';

/**
 * Hook to check if current viewport matches a specific breakpoint
 * @param breakpoint - The breakpoint to check against
 * @param direction - 'min' for >= breakpoint, 'max' for < breakpoint
 * @returns boolean indicating if breakpoint matches
 */
export const useBreakpoint = (
    breakpoint: BreakpointKey,
    direction: 'min' | 'max' = 'min'
): boolean => {
    const getMatches = (width: number): boolean => {
        const bp = BREAKPOINTS[breakpoint];
        return direction === 'min' ? width >= bp : width < bp;
    };

    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return getMatches(window.innerWidth);
    });

    useEffect(() => {
        const handleResize = () => {
            setMatches(getMatches(window.innerWidth));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [breakpoint, direction]);

    return matches;
};

/**
 * Hook to get current window width
 * @returns current window width in pixels
 */
export const useWindowWidth = (): number => {
    const [width, setWidth] = useState<number>(() => {
        return typeof window !== 'undefined' ? window.innerWidth : 1024;
    });

    useEffect(() => {
        const handleResize = () => {
            setWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return width;
};
