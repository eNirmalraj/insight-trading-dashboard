// src/hooks/useSignalViewMode.ts
import { useCallback, useEffect, useState } from 'react';

export type SignalViewMode = 'grid' | 'list';

const STORAGE_KEY = 'insight.signals.viewMode';
const DEFAULT_MODE: SignalViewMode = 'grid';

function readStoredMode(): SignalViewMode {
    if (typeof window === 'undefined') return DEFAULT_MODE;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === 'grid' || raw === 'list') return raw;
    } catch {
        // localStorage disabled (private mode, quota, etc.) — fall through
    }
    return DEFAULT_MODE;
}

export function useSignalViewMode(): [SignalViewMode, (m: SignalViewMode) => void] {
    const [mode, setModeState] = useState<SignalViewMode>(() => readStoredMode());

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            // ignore write failures
        }
    }, [mode]);

    const setMode = useCallback((next: SignalViewMode) => {
        setModeState(next);
    }, []);

    return [mode, setMode];
}
