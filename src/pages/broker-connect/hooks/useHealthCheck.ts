import { useCallback, useEffect, useRef, useState } from 'react';
import { testBrokerBatch, testBrokerCredential } from '../../../services/brokerCredentialService';

export type HealthStatus = 'connected' | 'disconnected' | 'untested' | 'testing' | 'paused';

export interface HealthEntry {
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
}

export function useHealthCheck(credIds: string[]) {
    const [map, setMap] = useState<Map<string, HealthEntry>>(new Map());
    const testedIdsRef = useRef<Set<string>>(new Set());

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

    // Track which ids we've already tested. When a new id appears, batch-test
    // only the untested ones so we don't re-hit brokers that already reported.
    useEffect(() => {
        if (credIds.length === 0) return;
        const untested = credIds.filter((id) => !testedIdsRef.current.has(id));
        if (untested.length === 0) return;
        for (const id of untested) testedIdsRef.current.add(id);
        void runBatch(untested);
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
