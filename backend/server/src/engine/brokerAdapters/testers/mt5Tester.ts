// MT5 health check via MetaAPI. MetaAPI proxies MT5 accounts through its
// cloud broker infrastructure, so this test creates a short-lived MetaAPI
// account record, deploys it, waits for the MT5 server handshake, reads
// account info, and removes the record. METAAPI_TOKEN env var is required.

import MetaApi from 'metaapi.cloud-sdk';
import type { BrokerCredentialsFull } from '../../../services/credentialVault';
import type { TestResult } from '../../../services/credentialHealth';

export async function testMT5(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();

    const token = process.env.METAAPI_TOKEN;
    if (!token) {
        return {
            ok: false, latencyMs: 0, permissions: [],
            error: 'METAAPI_TOKEN not configured on the server',
        };
    }
    if (!cred.mt5Login || !cred.mt5Password || !cred.mt5Server) {
        return {
            ok: false, latencyMs: 0, permissions: [],
            error: 'MT5 login, password, and server are all required',
        };
    }

    const api = new (MetaApi as any)(token);
    let account: any = null;

    try {
        account = await api.metatraderAccountApi.createAccount({
            name: `healthcheck-${cred.id}`,
            type: 'cloud',
            login: cred.mt5Login,
            password: cred.mt5Password,
            server: cred.mt5Server,
            platform: 'mt5',
            magic: 0,
        });
        await account.deploy();
        await account.waitConnected();
        const info = await account.getAccountInformation();

        const balancePreview = [{
            asset: info.currency ?? 'USD',
            free: String(info.balance ?? 0),
        }];

        return {
            ok: true,
            latencyMs: Math.round(performance.now() - start),
            permissions: ['Trade'],
            balancePreview,
        };
    } catch (e: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            error: e?.message ?? 'MT5 test failed',
        };
    } finally {
        if (account) {
            try { await account.remove(); } catch { /* cleanup best-effort */ }
        }
    }
}
