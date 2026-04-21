import { useCallback, useEffect, useState } from 'react';
import {
    listBrokerCredentials,
    createBrokerCredential,
    patchBrokerCredential,
    deleteBrokerCredential,
    BrokerCredentialInfo,
    CreateBody,
    Environment,
} from '../../../services/brokerCredentialService';

export function useBrokerCredentials() {
    const [creds, setCreds] = useState<BrokerCredentialInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setCreds(await listBrokerCredentials());
            setError(null);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load credentials');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const create = useCallback(async (body: CreateBody) => {
        const r = await createBrokerCredential(body);
        if ('id' in r) await refresh();
        return r;
    }, [refresh]);

    const patch = useCallback(async (id: string, body: { nickname?: string; environment?: Environment }) => {
        const r = await patchBrokerCredential(id, body);
        if ('id' in r) await refresh();
        return r;
    }, [refresh]);

    const remove = useCallback(async (id: string) => {
        const r = await deleteBrokerCredential(id);
        if ('ok' in r) await refresh();
        return r;
    }, [refresh]);

    return { creds, loading, error, refresh, create, patch, remove };
}
