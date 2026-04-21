import { useCallback, useEffect, useRef, useState } from 'react';
import { testBrokerBatch, testBrokerCredential } from '../../../services/brokerCredentialService';

export type HealthStatus = 'connected' | 'disconnected' | 'untested' | 'testing';

export interface HealthEntry {
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
}

export function useHealthCheck(credIds: string[]) {
    const [map, setMap] = useState<Map<string, HealthEntry>>(new Map());
    const didInitialRef = useRef(false);

    const runBatch = useCallback(async (ids: string[]) => {
        if (ids.length === 0) return;
        setMap((prev) => {
            const next = new Map(prev);
            for (const id of ids) next.set(id, { status: 'testing' });
            return next;
        });
        const results = await testBrokerBatch(ids);
        setMap((prev) => {
            const next = new Map(prev);
            for (const r of results) {
                next.set(r.id, {
                    status: r.ok ? 'connected' : 'disconnected',
                    latencyMs: r.latencyMs,
                    error: r.error,
                });
            }
            return next;
        });
    }, []);

    useEffect(() => {
        if (didInitialRef.current) return;
        if (credIds.length === 0) return;
        didInitialRef.current = true;
        void runBatch(credIds);
    }, [credIds, runBatch]);

    const testOne = useCallback(async (id: string) => {
        setMap((prev) => new Map(prev).set(id, { status: 'testing' }));
        const r = await testBrokerCredential(id);
        setMap((prev) => new Map(prev).set(id, {
            status: r.ok ? 'connected' : 'disconnected',
            latencyMs: r.latencyMs,
            error: r.error,
        }));
    }, []);

    return { map, testOne, refreshAll: () => runBatch(credIds) };
}
