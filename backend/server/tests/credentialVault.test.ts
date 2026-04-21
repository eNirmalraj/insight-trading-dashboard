import { credentialVault } from '../src/services/credentialVault';
import { supabaseAdmin } from '../src/services/supabaseAdmin';

// user_id is a FK to auth.users, so the test needs a real user. We look up the
// first user in auth.users at run time rather than hardcoding a UUID — that way
// the test works in any environment (local dev, CI, branch DB) as long as at
// least one user exists. If none does, the test fails with a clear message.
let TEST_USER_ID: string;

beforeAll(async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw new Error(`beforeAll: listUsers failed: ${error.message}`);
    const user = data?.users?.[0];
    if (!user) {
        throw new Error(
            'beforeAll: no auth.users row exists. Seed at least one user before running credentialVault tests.',
        );
    }
    TEST_USER_ID = user.id;
});

describe('credentialVault (extended fields)', () => {
    it('round-trips MT5 credentials', async () => {
        const { id } = await credentialVault.store({
            userId: TEST_USER_ID,
            broker: 'mt5',
            nickname: 'Test MT5',
            environment: 'demo',
            mt5Login: '12345678',
            mt5Password: 'sekret',
            mt5Server: 'ICMarkets-Demo',
        });
        const got = await credentialVault.retrieveById(id);
        expect(got).toMatchObject({
            broker: 'mt5',
            mt5Login: '12345678',
            mt5Password: 'sekret',
            mt5Server: 'ICMarkets-Demo',
        });
        await credentialVault.remove(id, TEST_USER_ID);
    });

    it('round-trips Bitget passphrase', async () => {
        const { id } = await credentialVault.store({
            userId: TEST_USER_ID,
            broker: 'bitget',
            nickname: 'Test Bitget',
            environment: 'mainnet',
            apiKey: 'key',
            apiSecret: 'secret',
            passphrase: 'passphrase-value',
        });
        const got = await credentialVault.retrieveById(id);
        expect(got).toMatchObject({
            broker: 'bitget',
            apiKey: 'key',
            apiSecret: 'secret',
            passphrase: 'passphrase-value',
        });
        await credentialVault.remove(id, TEST_USER_ID);
    });
});
