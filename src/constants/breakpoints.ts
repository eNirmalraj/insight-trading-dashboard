// Responsive breakpoints for the application
// These match Tailwind's default breakpoints

export const BREAKPOINTS = {
    mobile: 0,
    tablet: 768,  // md
    desktop: 1024, // lg
    xl: 1280,     // xl
    '2xl': 1536,  // 2xl
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

// Breakpoint values in pixels
export const BREAKPOINT_VALUES = {
    MOBILE_MAX: BREAKPOINTS.tablet - 1,
    TABLET_MIN: BREAKPOINTS.tablet,
    TABLET_MAX: BREAKPOINTS.desktop - 1,
    DESKTOP_MIN: BREAKPOINTS.desktop,
    XL_MIN: BREAKPOINTS.xl,
} as const;

// Media query strings for programmatic use
export const MEDIA_QUERIES = {
    mobile: `(max-width: ${BREAKPOINT_VALUES.MOBILE_MAX}px)`,
    tablet: `(min-width: ${BREAKPOINT_VALUES.TABLET_MIN}px) and (max-width: ${BREAKPOINT_VALUES.TABLET_MAX}px)`,
    desktop: `(min-width: ${BREAKPOINT_VALUES.DESKTOP_MIN}px)`,
    xl: `(min-width: ${BREAKPOINT_VALUES.XL_MIN}px)`,
} as const;
