# Broker Connect Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Broker Connect page with clean component architecture, consolidated credential storage (pgsodium vault only), honest health reporting via parallel test-on-load, and support for all 8 existing broker integrations.

**Architecture:** Extend `user_exchange_keys_v2` with all columns the legacy table held; retire the legacy table and bridge. Split backend per-broker testers behind a unified `testCredential` dispatcher, expose batch testing for page-load health checks. Frontend splits into category sections (Crypto / Forex / Stocks) with a shared `CredentialCard` and an add-connection wizard. Every write path funnels through `/api/broker-credentials` (delete every `/api/exchange/*` legacy route).

**Tech Stack:** Supabase + pgsodium (vault encryption); Node 20 + Express + TypeScript + ccxt v4 + MetaAPI SDK; React 18 + Vite + TailwindCSS on the frontend.

---

## File Structure

**Backend — new:**
- `backend/schema/066_broker_credentials_v2_extend.sql` — schema expansion
- `backend/schema/068_drop_user_exchange_keys.sql` — run after verification
- `backend/server/src/services/credentialHealth.ts` — unified `testCredential` dispatcher + shared `TestResult` type
- `backend/server/src/engine/brokerAdapters/testers/binanceTester.ts`
- `backend/server/src/engine/brokerAdapters/testers/bitgetTester.ts`
- `backend/server/src/engine/brokerAdapters/testers/mt5Tester.ts`
- `backend/server/src/engine/brokerAdapters/testers/indianBrokerTester.ts`
- `backend/server/scripts/migrateLegacyCredentials.ts` — 067 data copy
- `backend/server/scripts/verifyMigration067.ts` — post-migration sanity

**Backend — modified:**
- `backend/server/src/services/credentialVault.ts` — extend store/retrieve with new fields
- `backend/server/src/routes/brokerCredentials.ts` — POST/PATCH/DELETE rewrite + `/test`, `/test-batch`, `/oauth/:broker/start`, `/oauth/:broker/callback`
- `backend/server/src/services/oms.ts` — read from vault only (drop bridge call)
- `backend/server/src/routes/executeSignal.ts` — drop `credentialBridge`, use vault directly

**Backend — deleted (final task):**
- `backend/server/src/services/credentialBridge.ts`
- `backend/server/src/services/exchangeConnector.ts` (migrate any still-used helpers to `credentialHealth.ts` first)
- `backend/server/src/services/mt5Connector.ts`, `indianBrokerConnector.ts`, `oauthBrokers.ts` (fold into testers + new OAuth routes)
- `index.ts` routes `/api/exchange/*` and `/api/oauth/*`

**Frontend — new:**
- `src/pages/broker-connect/BrokerConnectPage.tsx`
- `src/pages/broker-connect/BrokerConnectHeader.tsx`
- `src/pages/broker-connect/sections/CryptoSection.tsx`
- `src/pages/broker-connect/sections/ForexSection.tsx`
- `src/pages/broker-connect/sections/StockSection.tsx`
- `src/pages/broker-connect/components/CredentialCard.tsx`
- `src/pages/broker-connect/components/HealthBadge.tsx`
- `src/pages/broker-connect/components/BrokerIcon.tsx`
- `src/pages/broker-connect/components/PermissionChips.tsx`
- `src/pages/broker-connect/wizards/AddConnectionWizard.tsx`
- `src/pages/broker-connect/wizards/CryptoCredentialForm.tsx`
- `src/pages/broker-connect/wizards/MT5CredentialForm.tsx`
- `src/pages/broker-connect/wizards/IndianBrokerForm.tsx`
- `src/pages/broker-connect/hooks/useBrokerCredentials.ts`
- `src/pages/broker-connect/hooks/useHealthCheck.ts`
- `src/pages/broker-connect/brokerMeta.ts` — broker id → name/icon/category lookup (pure data)

**Frontend — modified:**
- `src/services/brokerCredentialService.ts` — add endpoints: `testBrokerCredential`, `testBrokerBatch`, `patchBrokerCredential`, OAuth helpers
- `src/pages/Settings.tsx` (or equivalent containing Broker Connect tab) — replace tab body with `<BrokerConnectPage />`
- `src/components/ExecuteTradeModal.tsx` — reads from the same unified credential service; no user-facing change

**Frontend — deleted (final task):**
- `src/pages/ExchangeManagement.tsx`
- `src/pages/BrokerSettings.tsx`
- `src/services/exchangeService.ts` (legacy paths)
- `src/components/AddBrokerCredentialModal.tsx` (superseded by wizard)

---

## Task 1: Schema migration 066 — extend `user_exchange_keys_v2`

**Files:**
- Create: `backend/schema/066_broker_credentials_v2_extend.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- 066_broker_credentials_v2_extend.sql
-- Expand user_exchange_keys_v2 so it can hold every legacy broker credential shape.

BEGIN;

ALTER TABLE user_exchange_keys_v2
  ADD COLUMN IF NOT EXISTS environment text
      CHECK (environment IN ('testnet', 'live', 'mainnet', 'demo')),
  ADD COLUMN IF NOT EXISTS passphrase_encrypted bytea,
  ADD COLUMN IF NOT EXISTS mt5_login text,
  ADD COLUMN IF NOT EXISTS mt5_password_encrypted bytea,
  ADD COLUMN IF NOT EXISTS mt5_server text,
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS access_token_encrypted bytea,
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted bytea,
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_test_status text
      CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed')),
  ADD COLUMN IF NOT EXISTS last_test_error text;

-- Expand broker check constraint to cover all 8 integrations.
ALTER TABLE user_exchange_keys_v2
  DROP CONSTRAINT IF EXISTS user_exchange_keys_v2_broker_check;
ALTER TABLE user_exchange_keys_v2
  ADD CONSTRAINT user_exchange_keys_v2_broker_check CHECK (
    broker IN ('binance', 'bitget', 'mt5',
               'zerodha', 'angelone', 'upstox', 'dhan', 'fyers')
  );

-- Environment default: anything already in the table is binance mainnet/testnet
-- (Phase 1 seeded rows). Leave those untouched; new rows must supply environment.

COMMIT;
```

- [ ] **Step 2: Apply via Supabase MCP or psql**

Run the migration against the dev database. Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'user_exchange_keys_v2' ORDER BY ordinal_position;
```
Expected: 20+ columns listed including all new ones.

- [ ] **Step 3: Commit**

```bash
git add backend/schema/066_broker_credentials_v2_extend.sql
git commit -m "feat(schema): extend user_exchange_keys_v2 for all broker shapes"
```

---

## Task 2: Extend `credentialVault` store/retrieve for new fields

**Files:**
- Modify: `backend/server/src/services/credentialVault.ts`
- Test: `backend/server/tests/credentialVault.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/credentialVault.test.ts
import { credentialVault } from '../src/services/credentialVault';

describe('credentialVault (extended fields)', () => {
    it('round-trips MT5 credentials', async () => {
        const { id } = await credentialVault.store({
            userId: 'test-user',
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
        await credentialVault.remove(id, 'test-user');
    });

    it('round-trips Bitget passphrase', async () => {
        const { id } = await credentialVault.store({
            userId: 'test-user',
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
        await credentialVault.remove(id, 'test-user');
    });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd backend/server && npm test -- credentialVault.test`
Expected: FAIL — `store` does not accept `mt5Login`/`passphrase`; `retrieveById` does not return them.

- [ ] **Step 3: Extend `credentialVault.store`**

Replace the body of `credentialVault.store` in `backend/server/src/services/credentialVault.ts`:

```ts
export interface StoreInput {
    userId: string;
    broker: string;
    nickname: string;
    environment: 'testnet' | 'live' | 'mainnet' | 'demo';
    // Crypto
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    // MT5
    mt5Login?: string;
    mt5Password?: string;
    mt5Server?: string;
    // Indian brokers
    clientId?: string;
    accessToken?: string;
    totpSecret?: string;
}

export async function store(params: StoreInput): Promise<{ id: string }> {
    // Encrypt each sensitive field via the credential_encrypt RPC. The RPC
    // returns a struct matching the *_encrypted + nonce columns. Fields not
    // supplied are stored as NULL.
    const encrypt = async (plain: string | undefined) => {
        if (!plain) return { ciphertext: null, nonce: null };
        const { data, error } = await supabaseAdmin.rpc('credential_encrypt_one', {
            p_plain: plain,
        });
        if (error) throw new Error(`credential_encrypt_one: ${error.message}`);
        return { ciphertext: data.ciphertext as Buffer, nonce: data.nonce as Buffer };
    };

    const encKey = await encrypt(params.apiKey);
    const encSecret = await encrypt(params.apiSecret);
    const encPass = await encrypt(params.passphrase);
    const encMt5Pw = await encrypt(params.mt5Password);
    const encAccess = await encrypt(params.accessToken);
    const encTotp = await encrypt(params.totpSecret);

    const { data, error } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .insert({
            user_id: params.userId,
            broker: params.broker,
            nickname: params.nickname,
            environment: params.environment,
            api_key_encrypted: encKey.ciphertext,
            api_secret_encrypted: encSecret.ciphertext,
            passphrase_encrypted: encPass.ciphertext,
            mt5_login: params.mt5Login ?? null,
            mt5_password_encrypted: encMt5Pw.ciphertext,
            mt5_server: params.mt5Server ?? null,
            client_id: params.clientId ?? null,
            access_token_encrypted: encAccess.ciphertext,
            totp_secret_encrypted: encTotp.ciphertext,
            nonce: encKey.nonce ?? encSecret.nonce ?? encPass.nonce
                 ?? encMt5Pw.nonce ?? encAccess.nonce ?? encTotp.nonce,
            is_active: true,
        })
        .select('id').single();

    if (error || !data) throw new Error(`store: ${error?.message ?? 'no row'}`);
    return { id: data.id };
}
```

- [ ] **Step 4: Create helper RPC `credential_encrypt_one` if missing**

The old `credential_encrypt` encrypted two fields at once; we need a single-field variant. Add to migration 066 or create a new file `backend/schema/066b_credential_encrypt_one.sql`:

```sql
CREATE OR REPLACE FUNCTION credential_encrypt_one(p_plain text)
RETURNS TABLE(ciphertext bytea, nonce bytea) AS $$
DECLARE
    v_nonce bytea := pgsodium.crypto_aead_det_noncegen();
    v_key_id uuid := (SELECT id FROM pgsodium.key
                      WHERE name = 'broker_credentials_key' LIMIT 1);
BEGIN
    RETURN QUERY SELECT
        pgsodium.crypto_aead_det_encrypt(p_plain::bytea, ''::bytea, v_key_id, v_nonce),
        v_nonce;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
Apply it.

- [ ] **Step 5: Extend `retrieveById` return shape**

```ts
export interface BrokerCredentialsFull {
    id: string;
    userId: string;
    broker: string;
    environment: string | null;
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;
    mt5Login?: string;
    mt5Password?: string;
    mt5Server?: string;
    clientId?: string;
    accessToken?: string;
    totpSecret?: string;
}

export async function retrieveById(id: string): Promise<BrokerCredentialsFull | null> {
    const { data: row } = await supabaseAdmin
        .from('user_exchange_keys_v2')
        .select('*')
        .eq('id', id).eq('is_active', true).maybeSingle();
    if (!row) return null;

    const decrypt = async (ct: Buffer | null) => {
        if (!ct) return undefined;
        const { data, error } = await supabaseAdmin.rpc('credential_decrypt_one', {
            p_ct: ct, p_nonce: row.nonce,
        });
        if (error) return undefined;
        return data as string;
    };

    return {
        id: row.id,
        userId: row.user_id,
        broker: row.broker,
        environment: row.environment,
        apiKey: await decrypt(row.api_key_encrypted),
        apiSecret: await decrypt(row.api_secret_encrypted),
        passphrase: await decrypt(row.passphrase_encrypted),
        mt5Login: row.mt5_login ?? undefined,
        mt5Password: await decrypt(row.mt5_password_encrypted),
        mt5Server: row.mt5_server ?? undefined,
        clientId: row.client_id ?? undefined,
        accessToken: await decrypt(row.access_token_encrypted),
        totpSecret: await decrypt(row.totp_secret_encrypted),
    };
}
```
Add matching `credential_decrypt_one` SQL function in `066b`.

- [ ] **Step 6: Re-run tests**

Run: `cd backend/server && npm test -- credentialVault.test`
Expected: PASS (both MT5 and Bitget tests).

- [ ] **Step 7: Commit**

```bash
git add backend/schema/066b_credential_encrypt_one.sql backend/server/src/services/credentialVault.ts backend/server/tests/credentialVault.test.ts
git commit -m "feat(vault): extend credentialVault to store all broker field shapes"
```

---

## Task 3: Shared `TestResult` type and dispatcher scaffold

**Files:**
- Create: `backend/server/src/services/credentialHealth.ts`
- Test: `backend/server/tests/credentialHealth.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/credentialHealth.test.ts
import { testCredential } from '../src/services/credentialHealth';

jest.mock('../src/services/credentialVault', () => ({
    credentialVault: {
        retrieveById: jest.fn(async (id: string) => {
            if (id === 'missing') return null;
            return { id, userId: 'u', broker: 'binance', environment: 'testnet',
                     apiKey: 'k', apiSecret: 's' };
        }),
    },
}));

jest.mock('../src/engine/brokerAdapters/testers/binanceTester', () => ({
    testBinance: jest.fn(async () => ({ ok: true, latencyMs: 100, permissions: ['Futures'] })),
}));

describe('credentialHealth.testCredential', () => {
    it('returns not-found for unknown id', async () => {
        const r = await testCredential('missing');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/not found/i);
    });

    it('dispatches binance broker to testBinance', async () => {
        const r = await testCredential('any');
        expect(r.ok).toBe(true);
        expect(r.permissions).toContain('Futures');
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend/server && npm test -- credentialHealth.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the dispatcher**

```ts
// backend/server/src/services/credentialHealth.ts
import { credentialVault, BrokerCredentialsFull } from './credentialVault';

export interface TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    error?: string;
    balancePreview?: { asset: string; free: string }[];
}

type Tester = (cred: BrokerCredentialsFull) => Promise<TestResult>;

// Lazy-imported so tests can mock individual testers cleanly.
async function dispatcher(broker: string): Promise<Tester> {
    switch (broker) {
        case 'binance': return (await import('../engine/brokerAdapters/testers/binanceTester')).testBinance;
        case 'bitget':  return (await import('../engine/brokerAdapters/testers/bitgetTester')).testBitget;
        case 'mt5':     return (await import('../engine/brokerAdapters/testers/mt5Tester')).testMT5;
        case 'zerodha':
        case 'angelone':
        case 'upstox':
        case 'dhan':
        case 'fyers':
            return (await import('../engine/brokerAdapters/testers/indianBrokerTester')).testIndianBroker;
        default:
            throw new Error(`Unsupported broker: ${broker}`);
    }
}

export async function testCredential(id: string): Promise<TestResult> {
    const cred = await credentialVault.retrieveById(id);
    if (!cred) return { ok: false, latencyMs: 0, permissions: [], error: 'Credential not found' };
    try {
        const tester = await dispatcher(cred.broker);
        return await tester(cred);
    } catch (e: any) {
        return { ok: false, latencyMs: 0, permissions: [], error: e?.message ?? 'unknown error' };
    }
}
```

- [ ] **Step 4: Stub the 4 tester files so imports resolve**

For each file below, create with a single exported function that throws "not implemented" (we implement them in Tasks 4–7):
- `backend/server/src/engine/brokerAdapters/testers/binanceTester.ts`:
  ```ts
  export async function testBinance(): Promise<import('../../../services/credentialHealth').TestResult> {
      throw new Error('testBinance not implemented');
  }
  ```
- Same pattern for `bitgetTester.ts` (`testBitget`), `mt5Tester.ts` (`testMT5`), `indianBrokerTester.ts` (`testIndianBroker`).

- [ ] **Step 5: Run tests**

Run: `cd backend/server && npm test -- credentialHealth.test`
Expected: PASS (dispatcher test uses mocked `testBinance`).

- [ ] **Step 6: Commit**

```bash
git add backend/server/src/services/credentialHealth.ts backend/server/src/engine/brokerAdapters/testers/ backend/server/tests/credentialHealth.test.ts
git commit -m "feat(health): add credentialHealth.testCredential dispatcher with tester stubs"
```

---

## Task 4: `testBinance` implementation

**Files:**
- Modify: `backend/server/src/engine/brokerAdapters/testers/binanceTester.ts`
- Test: `backend/server/tests/testers/binanceTester.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/testers/binanceTester.test.ts
import { testBinance } from '../../src/engine/brokerAdapters/testers/binanceTester';

jest.mock('ccxt', () => {
    return {
        binanceusdm: class {
            constructor(public opts: any) {}
            urls = { api: {} as any };
            async fetchBalance() {
                if (this.opts.apiKey === 'bad') {
                    const err: any = new Error('binanceusdm {"code":-2008,"msg":"Invalid Api-Key ID."}');
                    throw err;
                }
                return { free: { USDT: '1000', BTC: '0.5', ETH: '0' } };
            }
            async fapiPrivateV2GetAccount() {
                return { canTrade: true };
            }
        },
    };
});

const base = {
    id: '1', userId: 'u', broker: 'binance', environment: 'testnet',
    apiKey: 'good', apiSecret: 's',
};

describe('testBinance', () => {
    it('returns ok with Futures permissions when fetchBalance succeeds', async () => {
        const r = await testBinance(base as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toEqual(expect.arrayContaining(['Futures', 'Futures Trading']));
        expect(r.balancePreview?.[0]?.asset).toBe('USDT');
    });

    it('returns ok:false with the real Binance error message', async () => {
        const r = await testBinance({ ...base, apiKey: 'bad' } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/Invalid Api-Key ID/);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend/server && npm test -- binanceTester.test`
Expected: FAIL — stub throws "not implemented".

- [ ] **Step 3: Implement `testBinance`**

```ts
// backend/server/src/engine/brokerAdapters/testers/binanceTester.ts
import ccxt from 'ccxt';
import { BrokerCredentialsFull } from '../../../services/credentialVault';
import { TestResult } from '../../../services/credentialHealth';

const DEMO_FAPI_BASE = 'https://demo-fapi.binance.com';

function applyDemoRouting(client: any) {
    client.urls.api.fapiPublic = `${DEMO_FAPI_BASE}/fapi/v1`;
    client.urls.api.fapiPublicV2 = `${DEMO_FAPI_BASE}/fapi/v2`;
    client.urls.api.fapiPublicV3 = `${DEMO_FAPI_BASE}/fapi/v3`;
    client.urls.api.fapiPrivate = `${DEMO_FAPI_BASE}/fapi/v1`;
    client.urls.api.fapiPrivateV2 = `${DEMO_FAPI_BASE}/fapi/v2`;
    client.urls.api.fapiPrivateV3 = `${DEMO_FAPI_BASE}/fapi/v3`;
    client.urls.api.fapiData = `${DEMO_FAPI_BASE}/futures/data`;
}

export async function testBinance(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();
    const isTestnet = cred.environment === 'testnet' || cred.environment === 'demo';
    const client = new (ccxt as any).binanceusdm({
        apiKey: cred.apiKey,
        secret: cred.apiSecret,
        enableRateLimit: true,
        timeout: 10_000,
    });
    if (isTestnet) applyDemoRouting(client);

    try {
        const bal = await client.fetchBalance();
        const permissions: string[] = ['Futures'];
        try {
            const acc = await client.fapiPrivateV2GetAccount();
            if (acc?.canTrade) permissions.push('Futures Trading');
        } catch { /* best-effort trade check */ }

        const freeMap = (bal?.free && typeof bal.free === 'object')
            ? (bal.free as unknown as Record<string, unknown>)
            : {};
        const balancePreview = Object.entries(freeMap)
            .filter(([, v]) => Number(v) > 0)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .slice(0, 5)
            .map(([asset, free]) => ({
                asset, free: Number(free).toFixed(6).replace(/\.?0+$/, ''),
            }));

        return {
            ok: true,
            latencyMs: Math.round(performance.now() - start),
            permissions,
            balancePreview,
        };
    } catch (e: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            error: e?.message ?? 'Binance test failed',
        };
    }
}
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- binanceTester.test`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/engine/brokerAdapters/testers/binanceTester.ts backend/server/tests/testers/binanceTester.test.ts
git commit -m "feat(testers): implement testBinance with demo-fapi routing and Futures permissions"
```

---

## Task 5: `testBitget` implementation

**Files:**
- Modify: `backend/server/src/engine/brokerAdapters/testers/bitgetTester.ts`
- Test: `backend/server/tests/testers/bitgetTester.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/testers/bitgetTester.test.ts
import { testBitget } from '../../src/engine/brokerAdapters/testers/bitgetTester';

jest.mock('ccxt', () => ({
    bitget: class {
        constructor(public opts: any) {}
        setSandboxMode = jest.fn();
        async fetchBalance() {
            if (this.opts.apiKey === 'bad') throw new Error('sign signature error');
            return { free: { USDT: '250' } };
        }
        async privateMixGetAccountAccounts() { return [{ marginCoin: 'USDT' }]; }
    },
}));

describe('testBitget', () => {
    it('returns ok with Spot+Futures when both succeed', async () => {
        const r = await testBitget({
            id: '1', userId: 'u', broker: 'bitget', environment: 'mainnet',
            apiKey: 'good', apiSecret: 's', passphrase: 'p',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toEqual(expect.arrayContaining(['Spot Trading', 'Futures']));
    });
    it('returns ok:false on bad signature', async () => {
        const r = await testBitget({
            id: '1', userId: 'u', broker: 'bitget', environment: 'mainnet',
            apiKey: 'bad', apiSecret: 's', passphrase: 'p',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/signature/);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend/server && npm test -- bitgetTester.test`
Expected: FAIL.

- [ ] **Step 3: Implement `testBitget`**

```ts
// backend/server/src/engine/brokerAdapters/testers/bitgetTester.ts
import ccxt from 'ccxt';
import { BrokerCredentialsFull } from '../../../services/credentialVault';
import { TestResult } from '../../../services/credentialHealth';

export async function testBitget(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();
    const client = new (ccxt as any).bitget({
        apiKey: cred.apiKey,
        secret: cred.apiSecret,
        password: cred.passphrase,
        enableRateLimit: true,
        timeout: 10_000,
    });
    if (cred.environment === 'testnet' || cred.environment === 'demo') {
        client.setSandboxMode(true);
    }

    try {
        const bal = await client.fetchBalance();
        const permissions: string[] = ['Spot Trading'];
        try {
            await client.privateMixGetAccountAccounts({ productType: 'umcbl' });
            permissions.push('Futures');
        } catch { /* no futures permission */ }

        const freeMap = (bal?.free && typeof bal.free === 'object')
            ? (bal.free as unknown as Record<string, unknown>)
            : {};
        const balancePreview = Object.entries(freeMap)
            .filter(([, v]) => Number(v) > 0)
            .sort(([, a], [, b]) => Number(b) - Number(a))
            .slice(0, 5)
            .map(([asset, free]) => ({
                asset, free: Number(free).toFixed(6).replace(/\.?0+$/, ''),
            }));

        return {
            ok: true,
            latencyMs: Math.round(performance.now() - start),
            permissions,
            balancePreview,
        };
    } catch (e: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            error: e?.message ?? 'Bitget test failed',
        };
    }
}
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- bitgetTester.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/engine/brokerAdapters/testers/bitgetTester.ts backend/server/tests/testers/bitgetTester.test.ts
git commit -m "feat(testers): implement testBitget with passphrase and sandbox support"
```

---

## Task 6: `testMT5` implementation via MetaAPI

**Files:**
- Modify: `backend/server/src/engine/brokerAdapters/testers/mt5Tester.ts`
- Test: `backend/server/tests/testers/mt5Tester.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/testers/mt5Tester.test.ts
import { testMT5 } from '../../src/engine/brokerAdapters/testers/mt5Tester';

jest.mock('metaapi.cloud-sdk', () => {
    return {
        default: class {
            constructor(public token: string) {}
            metatraderAccountApi = {
                getAccounts: async () => [],
                createAccount: async (params: any) => ({
                    id: 'fake-mt5-id',
                    deploy: async () => {},
                    waitConnected: async () => {},
                    getAccountInformation: async () => {
                        if (params.login === 'bad') throw new Error('login failed');
                        return {
                            broker: 'FakeBroker', currency: 'USD',
                            balance: 1000, leverage: 100, name: 'Test', server: params.server,
                        };
                    },
                    remove: async () => {},
                }),
            };
        },
    };
});

describe('testMT5', () => {
    it('returns ok with account info on success', async () => {
        const r = await testMT5({
            id: '1', userId: 'u', broker: 'mt5', environment: 'demo',
            mt5Login: '12345', mt5Password: 'pw', mt5Server: 'ICMarkets-Demo',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toContain('Trade');
    });
    it('returns ok:false on MetaAPI failure', async () => {
        const r = await testMT5({
            id: '1', userId: 'u', broker: 'mt5', environment: 'demo',
            mt5Login: 'bad', mt5Password: 'pw', mt5Server: 'ICMarkets-Demo',
        } as any);
        expect(r.ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend/server && npm test -- mt5Tester.test`
Expected: FAIL.

- [ ] **Step 3: Implement `testMT5`**

```ts
// backend/server/src/engine/brokerAdapters/testers/mt5Tester.ts
import MetaApi from 'metaapi.cloud-sdk';
import { BrokerCredentialsFull } from '../../../services/credentialVault';
import { TestResult } from '../../../services/credentialHealth';

export async function testMT5(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();
    const token = process.env.METAAPI_TOKEN;
    if (!token) {
        return { ok: false, latencyMs: 0, permissions: [], error: 'METAAPI_TOKEN not configured' };
    }
    if (!cred.mt5Login || !cred.mt5Password || !cred.mt5Server) {
        return { ok: false, latencyMs: 0, permissions: [], error: 'MT5 login/password/server required' };
    }

    const api = new (MetaApi as any)(token);
    let account: any | null = null;
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
        return {
            ok: true,
            latencyMs: Math.round(performance.now() - start),
            permissions: ['Trade'],
            balancePreview: [{ asset: info.currency ?? 'USD', free: String(info.balance ?? 0) }],
        };
    } catch (e: any) {
        return {
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            permissions: [],
            error: e?.message ?? 'MT5 test failed',
        };
    } finally {
        if (account) { try { await account.remove(); } catch { /* cleanup best-effort */ } }
    }
}
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- mt5Tester.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/engine/brokerAdapters/testers/mt5Tester.ts backend/server/tests/testers/mt5Tester.test.ts
git commit -m "feat(testers): implement testMT5 via MetaAPI with deploy/cleanup"
```

---

## Task 7: `testIndianBroker` implementation

**Files:**
- Modify: `backend/server/src/engine/brokerAdapters/testers/indianBrokerTester.ts`
- Test: `backend/server/tests/testers/indianBrokerTester.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/testers/indianBrokerTester.test.ts
import { testIndianBroker } from '../../src/engine/brokerAdapters/testers/indianBrokerTester';

const fakeFetch = jest.fn();
global.fetch = fakeFetch as any;

beforeEach(() => fakeFetch.mockReset());

describe('testIndianBroker', () => {
    it('zerodha: ok:true when /user/profile returns 200', async () => {
        fakeFetch.mockResolvedValue({
            ok: true, status: 200,
            json: async () => ({ data: { user_name: 'N', products: ['MIS', 'NRML'] } }),
        });
        const r = await testIndianBroker({
            id: '1', userId: 'u', broker: 'zerodha', environment: 'live',
            apiKey: 'k', accessToken: 't',
        } as any);
        expect(r.ok).toBe(true);
        expect(r.permissions).toContain('MIS');
    });

    it('fyers: ok:false when token expired', async () => {
        fakeFetch.mockResolvedValue({
            ok: false, status: 401,
            text: async () => 'Token expired',
        });
        const r = await testIndianBroker({
            id: '1', userId: 'u', broker: 'fyers', environment: 'live',
            apiKey: 'k', accessToken: 'expired',
        } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/expired|401/i);
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend/server && npm test -- indianBrokerTester.test`
Expected: FAIL.

- [ ] **Step 3: Implement `testIndianBroker`**

```ts
// backend/server/src/engine/brokerAdapters/testers/indianBrokerTester.ts
import { BrokerCredentialsFull } from '../../../services/credentialVault';
import { TestResult } from '../../../services/credentialHealth';

// Per-broker probe URL + auth header builder. Each returns { url, headers }.
function probeOf(cred: BrokerCredentialsFull): { url: string; headers: Record<string, string> } | null {
    switch (cred.broker) {
        case 'zerodha':
            return {
                url: 'https://api.kite.trade/user/profile',
                headers: { 'X-Kite-Version': '3', Authorization: `token ${cred.apiKey}:${cred.accessToken}` },
            };
        case 'upstox':
            return {
                url: 'https://api.upstox.com/v2/user/profile',
                headers: { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json' },
            };
        case 'fyers':
            return {
                url: 'https://api.fyers.in/api/v2/profile',
                headers: { Authorization: `${cred.apiKey}:${cred.accessToken}` },
            };
        case 'angelone':
            return {
                url: 'https://apiconnect.angelbroking.com/rest/secure/angelbroking/user/v1/getProfile',
                headers: {
                    'X-PrivateKey': cred.apiKey ?? '',
                    'X-UserType': 'USER', 'X-SourceID': 'WEB',
                    Authorization: `Bearer ${cred.accessToken}`,
                    'Content-Type': 'application/json', Accept: 'application/json',
                },
            };
        case 'dhan':
            return {
                url: 'https://api.dhan.co/fundlimit',
                headers: { 'access-token': cred.accessToken ?? cred.apiKey ?? '' },
            };
        default: return null;
    }
}

export async function testIndianBroker(cred: BrokerCredentialsFull): Promise<TestResult> {
    const start = performance.now();
    const probe = probeOf(cred);
    if (!probe) return { ok: false, latencyMs: 0, permissions: [], error: `Unsupported broker: ${cred.broker}` };
    try {
        const r = await fetch(probe.url, { headers: probe.headers,
            signal: AbortSignal.timeout(10_000) });
        const latencyMs = Math.round(performance.now() - start);
        if (!r.ok) {
            const text = await r.text().catch(() => String(r.status));
            return { ok: false, latencyMs, permissions: [],
                error: r.status === 401 ? `Token expired (401)` : text.slice(0, 200) };
        }
        const body = await r.json().catch(() => ({}));
        // Zerodha exposes products; other brokers don't, default to ['Read', 'Trade'].
        const permissions = Array.isArray(body?.data?.products) && body.data.products.length > 0
            ? (body.data.products as string[])
            : ['Read', 'Trade'];
        return { ok: true, latencyMs, permissions };
    } catch (e: any) {
        return { ok: false, latencyMs: Math.round(performance.now() - start),
            permissions: [], error: e?.message ?? 'Indian broker test failed' };
    }
}
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- indianBrokerTester.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/engine/brokerAdapters/testers/indianBrokerTester.ts backend/server/tests/testers/indianBrokerTester.test.ts
git commit -m "feat(testers): implement testIndianBroker for 5 brokers via REST profile probes"
```

---

## Task 8: Route `POST /api/broker-credentials/:id/test` + persist status

**Files:**
- Modify: `backend/server/src/routes/brokerCredentials.ts`
- Test: `backend/server/tests/routes/brokerCredentials.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/routes/brokerCredentials.test.ts
import express from 'express';
import request from 'supertest';
import brokerCredentialsRouter from '../../src/routes/brokerCredentials';

jest.mock('../../src/services/credentialHealth', () => ({
    testCredential: jest.fn(async (id: string) => id === 'ok'
        ? { ok: true, latencyMs: 123, permissions: ['Futures'] }
        : { ok: false, latencyMs: 50, permissions: [], error: 'Invalid' }),
}));
jest.mock('../../src/services/supabaseAdmin', () => ({
    supabaseAdmin: {
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
        from: () => ({
            update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }),
    },
}));

const app = express().use(express.json()).use('/api/broker-credentials', brokerCredentialsRouter);

describe('POST /api/broker-credentials/:id/test', () => {
    it('returns 200 with ok:true on successful test', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/ok/test')
            .set('Authorization', 'Bearer x');
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(true);
        expect(r.body.latencyMs).toBeGreaterThan(0);
    });
    it('returns 200 with ok:false when credential rejected', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/bad/test')
            .set('Authorization', 'Bearer x');
        expect(r.status).toBe(200);
        expect(r.body.ok).toBe(false);
        expect(r.body.error).toMatch(/Invalid/);
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Add the route to `brokerCredentials.ts`**

```ts
import { testCredential } from '../services/credentialHealth';

router.post('/:id/test', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { id } = req.params;
    const result = await testCredential(id);

    // Persist status. Don't persist on transient network errors (message starts with 'fetch failed' or 'timeout').
    const transient = /timeout|fetch failed|ETIMEDOUT|ECONNRESET/i.test(result.error ?? '');
    if (!transient) {
        await supabaseAdmin
            .from('user_exchange_keys_v2')
            .update({
                last_test_status: result.ok ? 'success' : 'failed',
                last_test_error: result.ok ? null : result.error ?? null,
                last_verified_at: result.ok ? new Date().toISOString() : undefined,
                permissions: result.permissions,
            })
            .eq('id', id)
            .eq('user_id', userId);
    }

    return res.json(result);
});
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/routes/brokerCredentials.ts backend/server/tests/routes/brokerCredentials.test.ts
git commit -m "feat(api): add POST /:id/test that persists health status with transient-aware writes"
```

---

## Task 9: Route `POST /test-batch` for parallel testing

**Files:**
- Modify: `backend/server/src/routes/brokerCredentials.ts`
- Test: `backend/server/tests/routes/brokerCredentials.test.ts` (extend)

- [ ] **Step 1: Add failing test**

Append to the existing test file:

```ts
describe('POST /api/broker-credentials/test-batch', () => {
    it('returns a result for every id even if some fail', async () => {
        const r = await request(app)
            .post('/api/broker-credentials/test-batch')
            .set('Authorization', 'Bearer x')
            .send({ ids: ['ok', 'bad', 'ok'] });
        expect(r.status).toBe(200);
        expect(r.body.results).toHaveLength(3);
        expect(r.body.results[0].ok).toBe(true);
        expect(r.body.results[1].ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

```ts
router.post('/test-batch', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (ids.length === 0) return res.json({ results: [] });

    const settled = await Promise.allSettled(ids.map(testCredential));
    const results = settled.map((s, i) => ({
        id: ids[i],
        ...(s.status === 'fulfilled'
            ? s.value
            : { ok: false, latencyMs: 0, permissions: [], error: String(s.reason) }),
    }));

    // Persist each (fire-and-forget; errors logged, not thrown).
    void Promise.all(results.map(async (r) => {
        const transient = /timeout|fetch failed|ETIMEDOUT|ECONNRESET/i.test(r.error ?? '');
        if (transient) return;
        await supabaseAdmin.from('user_exchange_keys_v2').update({
            last_test_status: r.ok ? 'success' : 'failed',
            last_test_error: r.ok ? null : r.error ?? null,
            last_verified_at: r.ok ? new Date().toISOString() : undefined,
            permissions: r.permissions,
        }).eq('id', r.id).eq('user_id', userId);
    })).catch((e) => console.warn('[test-batch] persist error:', e?.message));

    return res.json({ results });
});
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/routes/brokerCredentials.ts backend/server/tests/routes/brokerCredentials.test.ts
git commit -m "feat(api): add POST /test-batch for parallel health checks on page load"
```

---

## Task 10: Unified `POST /api/broker-credentials` for all broker shapes

**Files:**
- Modify: `backend/server/src/routes/brokerCredentials.ts`
- Test: `backend/server/tests/routes/brokerCredentials.test.ts` (extend)

- [ ] **Step 1: Add failing test**

```ts
describe('POST /api/broker-credentials (create)', () => {
    it('creates a Binance credential with api key/secret', async () => {
        (jest.mocked(require('../../src/services/credentialHealth').testCredential))
            .mockResolvedValueOnce({ ok: true, latencyMs: 100, permissions: ['Futures'] });
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ broker: 'binance', nickname: 'My Binance',
                environment: 'testnet', apiKey: 'k', apiSecret: 's' });
        expect(r.status).toBe(201);
        expect(r.body.id).toBeTruthy();
    });
    it('rejects MT5 without server', async () => {
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ broker: 'mt5', nickname: 'X', environment: 'demo',
                mt5Login: '1', mt5Password: 'pw' }); // no mt5Server
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('validation');
        expect(r.body.field).toBe('mt5Server');
    });
    it('rolls back (does not persist) if pre-persist test fails', async () => {
        (jest.mocked(require('../../src/services/credentialHealth').testCredential))
            .mockResolvedValueOnce({ ok: false, latencyMs: 100, permissions: [], error: 'Invalid' });
        const r = await request(app)
            .post('/api/broker-credentials')
            .set('Authorization', 'Bearer x')
            .send({ broker: 'binance', nickname: 'Bad', environment: 'testnet',
                apiKey: 'bad', apiSecret: 's' });
        expect(r.status).toBe(400);
        expect(r.body.error).toMatch(/Invalid/);
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: FAIL — validation + rollback path missing.

- [ ] **Step 3: Implement the validation + rollback flow**

Replace the current `router.post('/', ...)` handler with:

```ts
type CreateBody = {
    broker: string;
    nickname: string;
    environment: 'testnet' | 'live' | 'mainnet' | 'demo';
    apiKey?: string; apiSecret?: string; passphrase?: string;
    mt5Login?: string; mt5Password?: string; mt5Server?: string;
    clientId?: string; accessToken?: string; totpSecret?: string;
};

function validateCreate(b: CreateBody): { field?: string; error?: string } {
    if (!b.broker) return { field: 'broker', error: 'broker required' };
    if (!b.nickname) return { field: 'nickname', error: 'nickname required' };
    if (!['testnet', 'live', 'mainnet', 'demo'].includes(b.environment))
        return { field: 'environment', error: 'invalid environment' };

    const CRYPTO = ['binance', 'bitget'];
    const INDIAN = ['zerodha', 'angelone', 'upstox', 'dhan', 'fyers'];
    if (CRYPTO.includes(b.broker)) {
        if (!b.apiKey) return { field: 'apiKey', error: 'apiKey required' };
        if (!b.apiSecret) return { field: 'apiSecret', error: 'apiSecret required' };
        if (b.broker === 'bitget' && !b.passphrase)
            return { field: 'passphrase', error: 'passphrase required for Bitget' };
    } else if (b.broker === 'mt5') {
        if (!b.mt5Login) return { field: 'mt5Login', error: 'login required' };
        if (!b.mt5Password) return { field: 'mt5Password', error: 'password required' };
        if (!b.mt5Server) return { field: 'mt5Server', error: 'server required' };
    } else if (INDIAN.includes(b.broker)) {
        // OAuth brokers land here via the /oauth/:broker/callback path, not here.
        // Direct-API (Angel One, Dhan) require apiKey.
        if (!b.apiKey) return { field: 'apiKey', error: 'apiKey required' };
    } else {
        return { field: 'broker', error: `unsupported broker: ${b.broker}` };
    }
    return {};
}

router.post('/', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body as CreateBody;
    const v = validateCreate(body);
    if (v.error) return res.status(400).json({ error: v.error, code: 'validation', field: v.field });

    const { id } = await credentialVault.store({ userId, ...body });

    // Pre-persist test: if it fails, delete the row we just created.
    const test = await testCredential(id);
    if (!test.ok) {
        await supabaseAdmin.from('user_exchange_keys_v2').delete()
            .eq('id', id).eq('user_id', userId);
        return res.status(400).json({ error: test.error ?? 'test failed', code: 'adapter' });
    }

    // Persist permissions + mark verified.
    await supabaseAdmin.from('user_exchange_keys_v2').update({
        last_test_status: 'success',
        last_verified_at: new Date().toISOString(),
        permissions: test.permissions,
    }).eq('id', id);

    return res.status(201).json({ id });
});
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: PASS (3 scenarios: valid binance, invalid mt5, rejected-key rollback).

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/routes/brokerCredentials.ts backend/server/tests/routes/brokerCredentials.test.ts
git commit -m "feat(api): rewrite POST /broker-credentials with per-broker validation and pre-persist test"
```

---

## Task 11: Route `PATCH /:id` (edit) + safe `DELETE /:id`

**Files:**
- Modify: `backend/server/src/routes/brokerCredentials.ts`
- Test: `backend/server/tests/routes/brokerCredentials.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

```ts
describe('PATCH /api/broker-credentials/:id', () => {
    it('updates nickname only without touching keys', async () => {
        // supabase mock always returns error:null; we just assert response shape
        const r = await request(app)
            .patch('/api/broker-credentials/abc')
            .set('Authorization', 'Bearer x')
            .send({ nickname: 'Renamed' });
        expect(r.status).toBe(200);
        expect(r.body.id).toBe('abc');
    });
});

describe('DELETE /api/broker-credentials/:id', () => {
    it('blocks delete when active executions exist', async () => {
        // Override supabase mock to return 2 active rows
        const supa = require('../../src/services/supabaseAdmin').supabaseAdmin;
        supa.from = jest.fn((table: string) => {
            if (table === 'signal_executions') return {
                select: () => ({ eq: () => ({ eq: async () => ({ data: [{id:'e1'},{id:'e2'}], error: null }) }) }),
            };
            return { delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) };
        });
        const r = await request(app)
            .delete('/api/broker-credentials/abc')
            .set('Authorization', 'Bearer x');
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('active_executions');
        expect(r.body.count).toBe(2);
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: FAIL.

- [ ] **Step 3: Implement PATCH and update DELETE**

```ts
router.patch('/:id', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const { id } = req.params;
    const { nickname, environment, ...keyUpdates } = req.body ?? {};

    const patch: Record<string, any> = {};
    if (nickname !== undefined) patch.nickname = String(nickname);
    if (environment !== undefined) {
        if (!['testnet', 'live', 'mainnet', 'demo'].includes(environment))
            return res.status(400).json({ error: 'invalid environment', code: 'validation', field: 'environment' });
        patch.environment = environment;
    }

    if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from('user_exchange_keys_v2').update(patch)
            .eq('id', id).eq('user_id', userId);
    }

    // Key rotation path: if any *Key/*Secret/*Password field is present, re-encrypt + re-test.
    const rotateFields = ['apiKey', 'apiSecret', 'passphrase', 'mt5Password', 'accessToken', 'totpSecret'];
    const hasRotation = rotateFields.some((k) => k in keyUpdates);
    if (hasRotation) {
        // Simplest path: encrypt each supplied field via credential_encrypt_one and update column.
        const encrypt = async (plain: string) => {
            const { data } = await supabaseAdmin.rpc('credential_encrypt_one', { p_plain: plain });
            return data as { ciphertext: Buffer; nonce: Buffer };
        };
        const enc: Record<string, any> = {};
        if (keyUpdates.apiKey) {
            const e = await encrypt(keyUpdates.apiKey);
            enc.api_key_encrypted = e.ciphertext; enc.nonce = e.nonce;
        }
        if (keyUpdates.apiSecret) {
            const e = await encrypt(keyUpdates.apiSecret);
            enc.api_secret_encrypted = e.ciphertext;
        }
        if (keyUpdates.passphrase) {
            const e = await encrypt(keyUpdates.passphrase);
            enc.passphrase_encrypted = e.ciphertext;
        }
        if (keyUpdates.mt5Password) {
            const e = await encrypt(keyUpdates.mt5Password);
            enc.mt5_password_encrypted = e.ciphertext;
        }
        if (keyUpdates.accessToken) {
            const e = await encrypt(keyUpdates.accessToken);
            enc.access_token_encrypted = e.ciphertext;
        }
        if (keyUpdates.totpSecret) {
            const e = await encrypt(keyUpdates.totpSecret);
            enc.totp_secret_encrypted = e.ciphertext;
        }
        if (Object.keys(enc).length > 0) {
            await supabaseAdmin.from('user_exchange_keys_v2').update(enc)
                .eq('id', id).eq('user_id', userId);
        }
        // Re-test after rotation.
        const result = await testCredential(id);
        await supabaseAdmin.from('user_exchange_keys_v2').update({
            last_test_status: result.ok ? 'success' : 'failed',
            last_test_error: result.ok ? null : result.error,
            last_verified_at: result.ok ? new Date().toISOString() : undefined,
            permissions: result.permissions,
        }).eq('id', id);
    }

    return res.json({ id });
});

router.delete('/:id', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const { id } = req.params;

    // Active-execution guard.
    const { data: active } = await supabaseAdmin
        .from('signal_executions')
        .select('id')
        .eq('broker_credential_id', id)
        .eq('status', 'Active');
    if (active && active.length > 0) {
        return res.status(409).json({
            error: `${active.length} active executions use this credential`,
            code: 'active_executions', count: active.length,
        });
    }

    const { error } = await supabaseAdmin.from('user_exchange_keys_v2')
        .delete().eq('id', id).eq('user_id', userId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
});
```

- [ ] **Step 4: Run test**

Run: `cd backend/server && npm test -- brokerCredentials.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/server/src/routes/brokerCredentials.ts backend/server/tests/routes/brokerCredentials.test.ts
git commit -m "feat(api): PATCH for edit+rotate keys, DELETE guarded by active executions"
```

---

## Task 12: OAuth routes for Zerodha/Upstox/Fyers

**Files:**
- Modify: `backend/server/src/routes/brokerCredentials.ts`
- Create: `backend/server/src/services/oauthFlows.ts`
- Test: `backend/server/tests/oauthFlows.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// backend/server/tests/oauthFlows.test.ts
import { buildAuthorizeUrl, exchangeCode } from '../src/services/oauthFlows';

describe('oauthFlows.buildAuthorizeUrl', () => {
    it('zerodha URL includes api_key and state', () => {
        const url = buildAuthorizeUrl('zerodha', { state: 'abc', clientId: 'myapikey' });
        expect(url).toMatch(/kite\.trade\/connect\/login/);
        expect(url).toMatch(/api_key=myapikey/);
        expect(url).toMatch(/v=3/);
    });
    it('upstox URL includes redirect_uri and response_type=code', () => {
        process.env.UPSTOX_REDIRECT_URI = 'https://app.example.com/api/broker-credentials/oauth/upstox/callback';
        const url = buildAuthorizeUrl('upstox', { state: 'abc', clientId: 'cid' });
        expect(url).toContain('response_type=code');
        expect(url).toContain('redirect_uri=');
    });
});
```

- [ ] **Step 2: Run test**

Run: `cd backend/server && npm test -- oauthFlows.test`
Expected: FAIL.

- [ ] **Step 3: Create `oauthFlows.ts`**

```ts
// backend/server/src/services/oauthFlows.ts
// Thin helpers for generating broker authorize URLs and exchanging codes for tokens.
// Broker-specific quirks live here; the route handlers stay small.

export type OauthBroker = 'zerodha' | 'upstox' | 'fyers';

export interface AuthorizeParams { state: string; clientId: string; }

export function buildAuthorizeUrl(broker: OauthBroker, p: AuthorizeParams): string {
    switch (broker) {
        case 'zerodha': {
            const u = new URL('https://kite.trade/connect/login');
            u.searchParams.set('api_key', p.clientId);
            u.searchParams.set('v', '3');
            // Zerodha's kite.trade does not take an explicit state parameter;
            // use the 'redirect_params' field to pass it through the callback.
            u.searchParams.set('redirect_params', `state=${encodeURIComponent(p.state)}`);
            return u.toString();
        }
        case 'upstox': {
            const redirect = process.env.UPSTOX_REDIRECT_URI!;
            const u = new URL('https://api.upstox.com/v2/login/authorization/dialog');
            u.searchParams.set('client_id', p.clientId);
            u.searchParams.set('redirect_uri', redirect);
            u.searchParams.set('response_type', 'code');
            u.searchParams.set('state', p.state);
            return u.toString();
        }
        case 'fyers': {
            const redirect = process.env.FYERS_REDIRECT_URI!;
            const u = new URL('https://api.fyers.in/api/v2/generate-authcode');
            u.searchParams.set('client_id', p.clientId);
            u.searchParams.set('redirect_uri', redirect);
            u.searchParams.set('response_type', 'code');
            u.searchParams.set('state', p.state);
            return u.toString();
        }
    }
}

export interface ExchangeResult { accessToken: string; }

export async function exchangeCode(broker: OauthBroker, params: {
    code: string; clientId: string; clientSecret: string;
}): Promise<ExchangeResult> {
    switch (broker) {
        case 'zerodha': {
            // Zerodha's API signature is: SHA256(api_key + request_token + api_secret) as checksum.
            const crypto = await import('crypto');
            const checksum = crypto.createHash('sha256')
                .update(params.clientId + params.code + params.clientSecret).digest('hex');
            const r = await fetch('https://api.kite.trade/session/token', {
                method: 'POST',
                headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ api_key: params.clientId, request_token: params.code, checksum }),
            });
            if (!r.ok) throw new Error(`zerodha exchange: ${r.status}`);
            const body = await r.json();
            return { accessToken: body.data.access_token };
        }
        case 'upstox': {
            const r = await fetch('https://api.upstox.com/v2/login/authorization/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: new URLSearchParams({
                    code: params.code, client_id: params.clientId, client_secret: params.clientSecret,
                    redirect_uri: process.env.UPSTOX_REDIRECT_URI!, grant_type: 'authorization_code',
                }),
            });
            if (!r.ok) throw new Error(`upstox exchange: ${r.status}`);
            const body = await r.json();
            return { accessToken: body.access_token };
        }
        case 'fyers': {
            const crypto = await import('crypto');
            const appIdHash = crypto.createHash('sha256')
                .update(`${params.clientId}:${params.clientSecret}`).digest('hex');
            const r = await fetch('https://api.fyers.in/api/v2/validate-authcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ grant_type: 'authorization_code', appIdHash, code: params.code }),
            });
            if (!r.ok) throw new Error(`fyers exchange: ${r.status}`);
            const body = await r.json();
            return { accessToken: body.access_token };
        }
    }
}
```

- [ ] **Step 4: Add OAuth routes to brokerCredentials.ts**

```ts
import { buildAuthorizeUrl, exchangeCode, OauthBroker } from '../services/oauthFlows';
import crypto from 'crypto';

// In-memory state store (5-minute TTL). For production scale this should be
// a Redis/DB table; dev uses memory and clears expired entries on access.
const oauthStates = new Map<string, { userId: string; broker: OauthBroker; nickname: string;
    clientId: string; expiresAt: number }>();

router.post('/oauth/:broker/start', async (req: Request, res: Response) => {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const broker = req.params.broker as OauthBroker;
    if (!['zerodha', 'upstox', 'fyers'].includes(broker))
        return res.status(400).json({ error: 'non-OAuth broker' });

    const { nickname, clientId } = req.body ?? {};
    if (!nickname || !clientId)
        return res.status(400).json({ error: 'nickname + clientId required', code: 'validation' });

    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { userId, broker, nickname, clientId, expiresAt: Date.now() + 5 * 60_000 });

    // Opportunistic cleanup of expired entries (bounded memory).
    for (const [k, v] of oauthStates.entries()) {
        if (v.expiresAt < Date.now()) oauthStates.delete(k);
    }

    return res.json({ authorizeUrl: buildAuthorizeUrl(broker, { state, clientId }) });
});

router.post('/oauth/:broker/callback', async (req: Request, res: Response) => {
    const broker = req.params.broker as OauthBroker;
    const { code, state } = req.body ?? {};
    const entry = oauthStates.get(state);
    if (!entry || entry.expiresAt < Date.now() || entry.broker !== broker)
        return res.status(400).json({ error: 'invalid or expired state' });
    oauthStates.delete(state);

    const clientSecret = process.env[`${broker.toUpperCase()}_API_SECRET`];
    if (!clientSecret) return res.status(500).json({ error: `${broker} secret not configured` });

    try {
        const { accessToken } = await exchangeCode(broker, {
            code, clientId: entry.clientId, clientSecret,
        });
        const { id } = await credentialVault.store({
            userId: entry.userId,
            broker, nickname: entry.nickname, environment: 'live',
            apiKey: entry.clientId, accessToken,
        });
        const result = await testCredential(id);
        await supabaseAdmin.from('user_exchange_keys_v2').update({
            last_test_status: result.ok ? 'success' : 'failed',
            last_test_error: result.ok ? null : result.error,
            last_verified_at: result.ok ? new Date().toISOString() : undefined,
            permissions: result.permissions,
        }).eq('id', id);
        return res.json({ id, ok: result.ok, error: result.error });
    } catch (e: any) {
        return res.status(400).json({ error: e?.message ?? 'oauth exchange failed' });
    }
});
```

- [ ] **Step 5: Run tests**

Run: `cd backend/server && npm test -- oauthFlows.test brokerCredentials.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/server/src/services/oauthFlows.ts backend/server/src/routes/brokerCredentials.ts backend/server/tests/oauthFlows.test.ts
git commit -m "feat(api): OAuth start/callback for Zerodha/Upstox/Fyers via oauthFlows helpers"
```

---

## Task 13: Migration 067 — TS script to copy legacy rows into v2

**Files:**
- Create: `backend/server/scripts/migrateLegacyCredentials.ts`

- [ ] **Step 1: Write the script**

```ts
// backend/server/scripts/migrateLegacyCredentials.ts
// Copies rows from user_exchange_keys (legacy AES-GCM table) into
// user_exchange_keys_v2 (pgsodium vault). Idempotent: skips rows where a
// (user_id, broker, nickname) tuple already exists in v2.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { decrypt as legacyDecrypt } from '../src/services/exchangeConnector';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

interface LegacyRow {
    id: string; user_id: string; exchange: string; nickname: string;
    environment: string | null;
    api_key: string | null; api_secret: string | null;
    passphrase: string | null;
    mt5_login: string | null; mt5_password: string | null; mt5_server: string | null;
    client_id: string | null; access_token: string | null;
    totp_secret: string | null;
    permissions: string[] | null;
    last_test_status: string | null;
    is_active: boolean;
}

async function encryptOne(plain: string | null | undefined): Promise<Buffer | null> {
    if (!plain) return null;
    const { data, error } = await supabase.rpc('credential_encrypt_one', { p_plain: plain });
    if (error) throw new Error(`encrypt: ${error.message}`);
    return (data as any).ciphertext as Buffer;
}

async function main() {
    const { data: legacy, error } = await supabase
        .from('user_exchange_keys').select('*').order('created_at');
    if (error) { console.error('read legacy failed:', error.message); process.exit(1); }
    if (!legacy?.length) { console.log('Legacy table empty — nothing to migrate.'); return; }

    let copied = 0, skipped = 0, failed = 0;
    for (const row of legacy as LegacyRow[]) {
        try {
            // Skip if v2 already has this (user, broker, nickname) triple.
            const { data: existing } = await supabase
                .from('user_exchange_keys_v2').select('id')
                .eq('user_id', row.user_id).eq('broker', row.exchange).eq('nickname', row.nickname).maybeSingle();
            if (existing) { skipped++; continue; }

            const decrypt = (s: string | null) => s ? legacyDecrypt(s) : null;
            const apiKey = decrypt(row.api_key);
            const apiSecret = decrypt(row.api_secret);
            const passphrase = decrypt(row.passphrase);
            const mt5Password = decrypt(row.mt5_password);
            const accessToken = decrypt(row.access_token);
            const totpSecret = decrypt(row.totp_secret);

            const apiKeyEnc = await encryptOne(apiKey);
            const apiSecretEnc = await encryptOne(apiSecret);
            const passphraseEnc = await encryptOne(passphrase);
            const mt5PwEnc = await encryptOne(mt5Password);
            const accessEnc = await encryptOne(accessToken);
            const totpEnc = await encryptOne(totpSecret);

            // One nonce for the row (all fields use the same pgsodium det nonce since
            // credential_encrypt_one generates one per call — store the last non-null).
            const nonce = apiKeyEnc ? (await supabase.rpc('credential_encrypt_one', { p_plain: apiKey })).data?.nonce : null;

            const { error: insErr } = await supabase.from('user_exchange_keys_v2').insert({
                user_id: row.user_id,
                broker: row.exchange,
                nickname: row.nickname,
                environment: row.environment ?? 'mainnet',
                api_key_encrypted: apiKeyEnc,
                api_secret_encrypted: apiSecretEnc,
                passphrase_encrypted: passphraseEnc,
                mt5_login: row.mt5_login,
                mt5_password_encrypted: mt5PwEnc,
                mt5_server: row.mt5_server,
                client_id: row.client_id,
                access_token_encrypted: accessEnc,
                totp_secret_encrypted: totpEnc,
                nonce,
                permissions: row.permissions ?? [],
                last_test_status: row.last_test_status,
                is_active: row.is_active,
            });
            if (insErr) throw new Error(insErr.message);
            copied++;
            console.log(`  ✓ ${row.exchange.padEnd(10)} ${row.nickname}`);
        } catch (e: any) {
            failed++;
            console.error(`  ✗ ${row.nickname}:`, e.message);
        }
    }

    console.log(`\nSummary — copied=${copied}, skipped=${skipped}, failed=${failed}`);
    if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the migration on dev DB**

```bash
cd backend/server
npx tsx scripts/migrateLegacyCredentials.ts
```
Expected: prints ✓ lines for each legacy row, summary shows `failed=0`.

- [ ] **Step 3: Sanity-check with a read test**

Add `backend/server/scripts/verifyMigration067.ts`:

```ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { credentialVault } from '../src/services/credentialVault';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data: v2 } = await supabase
        .from('user_exchange_keys_v2').select('id, nickname');
    if (!v2) return;
    let ok = 0, bad = 0;
    for (const row of v2) {
        const full = await credentialVault.retrieveById(row.id);
        if (full && (full.apiKey || full.mt5Login || full.accessToken)) {
            ok++;
        } else {
            bad++;
            console.log('  ✗ decrypt failed for', row.nickname);
        }
    }
    console.log(`Verified ${ok}/${v2.length} rows, ${bad} failed.`);
    process.exit(bad === 0 ? 0 : 1);
}
main();
```
Run: `npx tsx scripts/verifyMigration067.ts`
Expected: all rows decrypt cleanly.

- [ ] **Step 4: Commit**

```bash
git add backend/server/scripts/migrateLegacyCredentials.ts backend/server/scripts/verifyMigration067.ts
git commit -m "feat(migration): 067 script copies user_exchange_keys into v2 vault, idempotent"
```

---

## Task 14: Update `oms.ts` + `executeSignal.ts` to drop bridge

**Files:**
- Modify: `backend/server/src/services/oms.ts`
- Modify: `backend/server/src/routes/executeSignal.ts`

- [ ] **Step 1: Replace bridge calls with direct vault calls**

In `oms.ts`, change the resolve step:

```ts
// Remove: import { credentialBridge } from './credentialBridge';
import { credentialVault } from './credentialVault';

async function resolveCredentials(intent: OrderIntent): Promise<BrokerCredentials | null> {
    if (intent.broker === BrokerType.PAPER) return null;
    if (!intent.brokerCredentialId) throw OmsError.credential('no credential id');
    const full = await credentialVault.retrieveById(intent.brokerCredentialId);
    if (!full) throw OmsError.credential('credentials not found or decrypt failed');
    // BrokerCredentials used by adapters only needs { id, userId, broker, apiKey, apiSecret };
    // MT5 etc. fetch additional fields directly from `full` downstream as needed.
    return { id: full.id, userId: full.userId, broker: full.broker,
             apiKey: full.apiKey ?? '', apiSecret: full.apiSecret ?? '' };
}
```

In `executeSignal.ts`, remove the bridge import and rewrite the broker lookup:

```ts
// Remove: import { credentialBridge } from '../services/credentialBridge';
import { credentialVault } from '../services/credentialVault';

// replacing meta lookup
let broker: BrokerType = BrokerType.PAPER;
if (brokerCredentialId) {
    const cred = await credentialVault.retrieveById(brokerCredentialId);
    if (!cred) return res.status(404).json({ error: 'credential not found' });
    broker = cred.broker as BrokerType;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend/server && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/server/src/services/oms.ts backend/server/src/routes/executeSignal.ts
git commit -m "refactor(oms): read credentials directly from vault, remove bridge dependency"
```

---

## Task 15: Frontend scaffold — service + hooks + page shell

**Files:**
- Modify: `src/services/brokerCredentialService.ts`
- Create: `src/pages/broker-connect/hooks/useBrokerCredentials.ts`
- Create: `src/pages/broker-connect/hooks/useHealthCheck.ts`
- Create: `src/pages/broker-connect/brokerMeta.ts`
- Create: `src/pages/broker-connect/BrokerConnectPage.tsx`

- [ ] **Step 1: Extend the frontend service**

Replace `src/services/brokerCredentialService.ts` with:

```ts
import { db } from './supabaseClient';

export type BrokerId = 'binance' | 'bitget' | 'mt5' | 'zerodha' | 'angelone' | 'upstox' | 'dhan' | 'fyers';
export type Environment = 'testnet' | 'live' | 'mainnet' | 'demo';

export interface BrokerCredentialInfo {
    id: string;
    broker: BrokerId;
    nickname: string;
    environment: Environment | null;
    is_active: boolean;
    last_test_status: 'success' | 'failed' | null;
    last_test_error: string | null;
    last_verified_at: string | null;
    permissions: string[];
    api_key_preview: string;
}

export interface TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    error?: string;
    balancePreview?: { asset: string; free: string }[];
}

async function authHeader(): Promise<Record<string, string>> {
    const { data } = await db().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listBrokerCredentials(): Promise<BrokerCredentialInfo[]> {
    const r = await fetch('/api/broker-credentials', { headers: await authHeader() });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).credentials;
}

export async function createBrokerCredential(body: any): Promise<{ id: string } | { error: string; field?: string; code?: string }> {
    const r = await fetch('/api/broker-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error, field: data.field, code: data.code };
    return { id: data.id };
}

export async function patchBrokerCredential(id: string, body: any): Promise<{ id: string } | { error: string }> {
    const r = await fetch(`/api/broker-credentials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error };
    return { id: data.id };
}

export async function deleteBrokerCredential(id: string): Promise<{ ok: true } | { error: string; code?: string; count?: number }> {
    const r = await fetch(`/api/broker-credentials/${id}`, { method: 'DELETE', headers: await authHeader() });
    const data = await r.json();
    if (!r.ok) return { error: data.error, code: data.code, count: data.count };
    return { ok: true };
}

export async function testBrokerCredential(id: string): Promise<TestResult> {
    const r = await fetch(`/api/broker-credentials/${id}/test`, { method: 'POST', headers: await authHeader() });
    return r.json();
}

export async function testBrokerBatch(ids: string[]): Promise<Array<TestResult & { id: string }>> {
    if (ids.length === 0) return [];
    const r = await fetch('/api/broker-credentials/test-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ ids }),
    });
    return (await r.json()).results;
}

export async function startOAuth(broker: 'zerodha' | 'upstox' | 'fyers', nickname: string, clientId: string): Promise<{ authorizeUrl: string } | { error: string }> {
    const r = await fetch(`/api/broker-credentials/oauth/${broker}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ nickname, clientId }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error };
    return { authorizeUrl: data.authorizeUrl };
}

export async function completeOAuth(broker: 'zerodha' | 'upstox' | 'fyers', code: string, state: string): Promise<{ id: string; ok: boolean; error?: string } | { error: string }> {
    const r = await fetch(`/api/broker-credentials/oauth/${broker}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ code, state }),
    });
    const data = await r.json();
    if (!r.ok) return { error: data.error };
    return data;
}
```

- [ ] **Step 2: Create `brokerMeta.ts`**

```ts
// src/pages/broker-connect/brokerMeta.ts
import { BrokerId } from '../../services/brokerCredentialService';

export type Category = 'crypto' | 'forex' | 'indian';

export interface BrokerMeta {
    id: BrokerId;
    name: string;
    category: Category;
    iconLetters: string;     // 2-letter abbreviation
    iconBgClass: string;     // tailwind background
    authMethod: 'key_secret' | 'key_secret_passphrase' | 'mt5_login' | 'oauth' | 'direct_api';
}

export const BROKERS: Record<BrokerId, BrokerMeta> = {
    binance:  { id: 'binance',  name: 'Binance',      category: 'crypto', iconLetters: 'BN', iconBgClass: 'bg-yellow-500',  authMethod: 'key_secret' },
    bitget:   { id: 'bitget',   name: 'Bitget',       category: 'crypto', iconLetters: 'BT', iconBgClass: 'bg-teal-500',    authMethod: 'key_secret_passphrase' },
    mt5:      { id: 'mt5',      name: 'MetaTrader 5', category: 'forex',  iconLetters: 'MT', iconBgClass: 'bg-blue-600',    authMethod: 'mt5_login' },
    zerodha:  { id: 'zerodha',  name: 'Zerodha',      category: 'indian', iconLetters: 'ZE', iconBgClass: 'bg-orange-500',  authMethod: 'oauth' },
    angelone: { id: 'angelone', name: 'Angel One',    category: 'indian', iconLetters: 'AO', iconBgClass: 'bg-red-500',     authMethod: 'direct_api' },
    upstox:   { id: 'upstox',   name: 'Upstox',       category: 'indian', iconLetters: 'UP', iconBgClass: 'bg-purple-500',  authMethod: 'oauth' },
    dhan:     { id: 'dhan',     name: 'Dhan',         category: 'indian', iconLetters: 'DH', iconBgClass: 'bg-indigo-500',  authMethod: 'direct_api' },
    fyers:    { id: 'fyers',    name: 'Fyers',        category: 'indian', iconLetters: 'FY', iconBgClass: 'bg-pink-500',    authMethod: 'oauth' },
};

export function categoryOf(broker: BrokerId): Category { return BROKERS[broker].category; }
```

- [ ] **Step 3: Create `useBrokerCredentials` hook**

```ts
// src/pages/broker-connect/hooks/useBrokerCredentials.ts
import { useCallback, useEffect, useState } from 'react';
import {
    listBrokerCredentials, createBrokerCredential, patchBrokerCredential,
    deleteBrokerCredential, BrokerCredentialInfo,
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
            setError(e?.message ?? 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const create = useCallback(async (body: any) => {
        const r = await createBrokerCredential(body);
        if ('id' in r) await refresh();
        return r;
    }, [refresh]);

    const patch = useCallback(async (id: string, body: any) => {
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
```

- [ ] **Step 4: Create `useHealthCheck` hook**

```ts
// src/pages/broker-connect/hooks/useHealthCheck.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { testBrokerBatch, testBrokerCredential, TestResult } from '../../../services/brokerCredentialService';

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
        const r: TestResult = await testBrokerCredential(id);
        setMap((prev) => new Map(prev).set(id, {
            status: r.ok ? 'connected' : 'disconnected',
            latencyMs: r.latencyMs,
            error: r.error,
        }));
    }, []);

    return { map, testOne, refreshAll: () => runBatch(credIds) };
}
```

- [ ] **Step 5: Create page shell**

```tsx
// src/pages/broker-connect/BrokerConnectPage.tsx
import React, { useMemo, useState } from 'react';
import { useBrokerCredentials } from './hooks/useBrokerCredentials';
import { useHealthCheck } from './hooks/useHealthCheck';
import BrokerConnectHeader from './BrokerConnectHeader';
import CryptoSection from './sections/CryptoSection';
import ForexSection from './sections/ForexSection';
import StockSection from './sections/StockSection';
import AddConnectionWizard from './wizards/AddConnectionWizard';

const BrokerConnectPage: React.FC = () => {
    const { creds, loading, refresh, remove } = useBrokerCredentials();
    const ids = useMemo(() => creds.filter((c) => c.is_active).map((c) => c.id), [creds]);
    const { map: healthMap, testOne, refreshAll } = useHealthCheck(ids);
    const [showWizard, setShowWizard] = useState(false);

    const summary = useMemo(() => {
        const total = creds.length;
        const healthy = Array.from(healthMap.values()).filter((h) => h.status === 'connected').length;
        const disconnected = Array.from(healthMap.values()).filter((h) => h.status === 'disconnected').length;
        return { total, healthy, disconnected };
    }, [creds, healthMap]);

    if (loading) return <div className="p-6 text-gray-400">Loading broker connections…</div>;

    return (
        <div className="p-6 space-y-6">
            <BrokerConnectHeader summary={summary} onAdd={() => setShowWizard(true)} />
            <CryptoSection creds={creds} healthMap={healthMap} onTest={testOne} onRemove={remove} onAdd={() => setShowWizard(true)} />
            <ForexSection   creds={creds} healthMap={healthMap} onTest={testOne} onRemove={remove} onAdd={() => setShowWizard(true)} />
            <StockSection   creds={creds} healthMap={healthMap} onTest={testOne} onRemove={remove} onAdd={() => setShowWizard(true)} />
            {showWizard && (
                <AddConnectionWizard
                    onClose={() => setShowWizard(false)}
                    onAdded={() => { setShowWizard(false); void refresh(); void refreshAll(); }}
                />
            )}
        </div>
    );
};

export default BrokerConnectPage;
```

- [ ] **Step 6: Create stub files so `BrokerConnectPage` imports compile**

Each of `BrokerConnectHeader.tsx`, `sections/CryptoSection.tsx`, `ForexSection.tsx`, `StockSection.tsx`, `wizards/AddConnectionWizard.tsx` gets a minimal stub `export default () => null;` — implemented in subsequent tasks.

- [ ] **Step 7: Typecheck**

Run: `cd "My Project" && npx tsc --noEmit 2>&1 | grep "broker-connect" | head -20`
Expected: no errors in `broker-connect/*`.

- [ ] **Step 8: Commit**

```bash
git add src/services/brokerCredentialService.ts src/pages/broker-connect/
git commit -m "feat(broker-connect): scaffold page, hooks, service, brokerMeta"
```

---

## Task 16: Presentational components — `BrokerIcon`, `HealthBadge`, `PermissionChips`

**Files:**
- Create: `src/pages/broker-connect/components/BrokerIcon.tsx`
- Create: `src/pages/broker-connect/components/HealthBadge.tsx`
- Create: `src/pages/broker-connect/components/PermissionChips.tsx`

- [ ] **Step 1: BrokerIcon**

```tsx
// src/pages/broker-connect/components/BrokerIcon.tsx
import React from 'react';
import { BROKERS } from '../brokerMeta';
import { BrokerId } from '../../../services/brokerCredentialService';

interface Props { broker: BrokerId; size?: 'sm' | 'md' | 'lg'; }

const SIZES = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
};

const BrokerIcon: React.FC<Props> = ({ broker, size = 'md' }) => {
    const meta = BROKERS[broker];
    return (
        <div
            aria-label={`${meta.name} icon`}
            className={`${SIZES[size]} ${meta.iconBgClass} rounded-lg flex items-center justify-center font-bold font-mono text-white shrink-0`}
        >
            {meta.iconLetters}
        </div>
    );
};
export default BrokerIcon;
```

- [ ] **Step 2: HealthBadge**

```tsx
// src/pages/broker-connect/components/HealthBadge.tsx
import React from 'react';
import { HealthStatus } from '../hooks/useHealthCheck';

interface Props {
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
}

const BADGE_CLASSES: Record<HealthStatus, { dot: string; text: string; bg: string; label: string }> = {
    connected:    { dot: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/10', label: 'Connected' },
    disconnected: { dot: 'bg-red-500',   text: 'text-red-400',   bg: 'bg-red-500/10',   label: 'Disconnected' },
    untested:     { dot: 'bg-yellow-500',text: 'text-yellow-400',bg: 'bg-yellow-500/10',label: 'Untested' },
    testing:      { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Testing…' },
};

const HealthBadge: React.FC<Props> = ({ status, latencyMs, error }) => {
    const c = BADGE_CLASSES[status];
    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${c.bg} ${c.text}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            <span className="font-medium">{c.label}</span>
            {status === 'connected' && typeof latencyMs === 'number' && (
                <span className="text-gray-500 font-mono">{latencyMs}ms</span>
            )}
            {status === 'disconnected' && error && (
                <span className="text-gray-500 truncate max-w-[12rem]" title={error}>· {error}</span>
            )}
        </div>
    );
};
export default HealthBadge;
```

- [ ] **Step 3: PermissionChips**

```tsx
// src/pages/broker-connect/components/PermissionChips.tsx
import React from 'react';

interface Props { permissions: string[]; }

const PermissionChips: React.FC<Props> = ({ permissions }) => {
    if (!permissions || permissions.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5 mt-2">
            {permissions.map((p) => (
                <span key={p} className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    {p}
                </span>
            ))}
        </div>
    );
};
export default PermissionChips;
```

- [ ] **Step 4: Typecheck**

Run: `cd "My Project" && npx tsc --noEmit 2>&1 | grep "broker-connect/components" | head -5`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/broker-connect/components/
git commit -m "feat(broker-connect): presentational components (icon, badge, chips)"
```

---

## Task 17: `CredentialCard` composed component

**Files:**
- Create: `src/pages/broker-connect/components/CredentialCard.tsx`

- [ ] **Step 1: Write the card**

```tsx
// src/pages/broker-connect/components/CredentialCard.tsx
import React, { useState } from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { BROKERS } from '../brokerMeta';
import { HealthEntry } from '../hooks/useHealthCheck';
import BrokerIcon from './BrokerIcon';
import HealthBadge from './HealthBadge';
import PermissionChips from './PermissionChips';

interface Props {
    credential: BrokerCredentialInfo;
    health: HealthEntry;
    onTest: () => void;
    onEdit?: () => void;
    onRemove: () => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
}

function timeAgo(iso: string | null): string {
    if (!iso) return 'never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

const CredentialCard: React.FC<Props> = ({ credential, health, onTest, onEdit, onRemove }) => {
    const meta = BROKERS[credential.broker];
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [removeError, setRemoveError] = useState<string | null>(null);

    const handleRemove = async () => {
        setRemoveError(null);
        const r = await onRemove();
        if ('error' in r) {
            setRemoveError(r.code === 'active_executions'
                ? `Blocked: ${r.count} active executions use this. Close them first.`
                : r.error);
            setConfirmRemove(false);
        }
    };

    return (
        <div className="p-4 bg-[#18181b] border border-gray-800 rounded-xl hover:border-gray-700 transition">
            <div className="flex items-center gap-3">
                <BrokerIcon broker={credential.broker} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white truncate">{credential.nickname}</span>
                        {credential.environment && (
                            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                                {credential.environment}
                            </span>
                        )}
                        <HealthBadge status={health?.status ?? 'untested'}
                                     latencyMs={health?.latencyMs}
                                     error={health?.error ?? credential.last_test_error ?? undefined} />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {meta.name} · <span className="font-mono">{credential.api_key_preview || '—'}</span>
                        · Tested {timeAgo(credential.last_verified_at)}
                    </div>
                </div>
            </div>

            {health?.status === 'connected' && <PermissionChips permissions={credential.permissions} />}

            {removeError && (
                <div className="mt-2 p-2 text-xs bg-red-500/10 border border-red-500/30 rounded text-red-300">
                    {removeError}
                </div>
            )}

            <div className="mt-3 flex items-center gap-3 text-xs">
                <button type="button" onClick={onTest}
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                    <span className="i-lucide-play" /> Test Connection
                </button>
                {onEdit && (
                    <button type="button" onClick={onEdit}
                            className="inline-flex items-center gap-1 text-gray-300 hover:text-white">
                        Edit
                    </button>
                )}
                {!confirmRemove ? (
                    <button type="button" onClick={() => setConfirmRemove(true)}
                            className="inline-flex items-center gap-1 text-red-400 hover:text-red-300">
                        Remove
                    </button>
                ) : (
                    <>
                        <button type="button" onClick={handleRemove}
                                className="inline-flex items-center gap-1 text-red-300 font-bold">
                            Confirm delete
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(false)}
                                className="text-gray-400">Cancel</button>
                    </>
                )}
            </div>
        </div>
    );
};
export default CredentialCard;
```

- [ ] **Step 2: Typecheck**

Run: `cd "My Project" && npx tsc --noEmit 2>&1 | grep "CredentialCard" | head -5`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/broker-connect/components/CredentialCard.tsx
git commit -m "feat(broker-connect): CredentialCard with inline confirm-delete and per-card actions"
```

---

## Task 18: `BrokerConnectHeader`

**Files:**
- Create: `src/pages/broker-connect/BrokerConnectHeader.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/pages/broker-connect/BrokerConnectHeader.tsx
import React from 'react';

interface Props {
    summary: { total: number; healthy: number; disconnected: number };
    onAdd: () => void;
}

const BrokerConnectHeader: React.FC<Props> = ({ summary, onAdd }) => (
    <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">Broker Connections</h1>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
                Connect your exchange and broker accounts so Insight can place trades on your behalf.
                All keys are encrypted with Supabase Vault and never leave the server.
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="text-gray-400">{summary.total} connected</span>
                <span className="text-green-400">{summary.healthy} healthy</span>
                <span className="text-red-400">{summary.disconnected} disconnected</span>
            </div>
        </div>
        <button type="button" onClick={onAdd}
                className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold">
            + Add Connection
        </button>
    </div>
);
export default BrokerConnectHeader;
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd "My Project" && npx tsc --noEmit 2>&1 | grep "BrokerConnectHeader" | head -5`
Expected: clean.

```bash
git add src/pages/broker-connect/BrokerConnectHeader.tsx
git commit -m "feat(broker-connect): page header with summary strip and global add button"
```

---

## Task 19: `CryptoSection` + `CryptoCredentialForm`

**Files:**
- Create: `src/pages/broker-connect/sections/CryptoSection.tsx`
- Create: `src/pages/broker-connect/wizards/CryptoCredentialForm.tsx`

- [ ] **Step 1: `CryptoSection`**

```tsx
// src/pages/broker-connect/sections/CryptoSection.tsx
import React from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { categoryOf } from '../brokerMeta';
import CredentialCard from '../components/CredentialCard';
import { HealthEntry } from '../hooks/useHealthCheck';

interface Props {
    creds: BrokerCredentialInfo[];
    healthMap: Map<string, HealthEntry>;
    onTest: (id: string) => void;
    onRemove: (id: string) => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
    onAdd: () => void;
}

const CryptoSection: React.FC<Props> = ({ creds, healthMap, onTest, onRemove, onAdd }) => {
    const items = creds.filter((c) => categoryOf(c.broker) === 'crypto');
    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Crypto Exchanges</h2>
                {items.length > 0 && (
                    <button type="button" onClick={onAdd} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
                )}
            </div>
            {items.length === 0 ? (
                <button type="button" onClick={onAdd}
                        className="w-full p-6 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-gray-300 hover:border-gray-600">
                    Connect Binance or Bitget to auto-execute signals
                </button>
            ) : (
                <div className="space-y-2">
                    {items.map((c) => (
                        <CredentialCard key={c.id}
                                        credential={c}
                                        health={healthMap.get(c.id) ?? { status: 'untested' }}
                                        onTest={() => onTest(c.id)}
                                        onRemove={() => onRemove(c.id)} />
                    ))}
                </div>
            )}
        </section>
    );
};
export default CryptoSection;
```

- [ ] **Step 2: `CryptoCredentialForm`**

```tsx
// src/pages/broker-connect/wizards/CryptoCredentialForm.tsx
import React, { useState } from 'react';
import { BrokerId, createBrokerCredential } from '../../../services/brokerCredentialService';

interface Props {
    broker: Extract<BrokerId, 'binance' | 'bitget'>;
    onCancel: () => void;
    onSaved: () => void;
}

const CryptoCredentialForm: React.FC<Props> = ({ broker, onCancel, onSaved }) => {
    const [nickname, setNickname] = useState('');
    const [environment, setEnvironment] = useState<'testnet' | 'mainnet'>('testnet');
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);

    const canSave = !!nickname && !!apiKey && !!apiSecret && (broker !== 'bitget' || !!passphrase) && !saving;

    const handleSave = async () => {
        setSaving(true);
        setError(null); setFieldError(null);
        const body: any = { broker, nickname, environment, apiKey, apiSecret };
        if (broker === 'bitget') body.passphrase = passphrase;
        const r = await createBrokerCredential(body);
        if ('error' in r) {
            setError(r.error);
            setFieldError(r.field ?? null);
            setSaving(false);
            return;
        }
        onSaved();
    };

    return (
        <div className="space-y-3">
            <Field label="Nickname">
                <input value={nickname} onChange={(e) => setNickname(e.target.value)}
                       placeholder={broker === 'binance' ? 'My Binance Futures' : 'My Bitget'}
                       className="input-base" />
            </Field>
            <Field label="Environment">
                <div className="flex gap-2">
                    <button type="button" onClick={() => setEnvironment('testnet')}
                            className={`flex-1 py-2 rounded text-sm ${environment === 'testnet' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-300'}`}>Testnet</button>
                    <button type="button" onClick={() => setEnvironment('mainnet')}
                            className={`flex-1 py-2 rounded text-sm ${environment === 'mainnet' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-300'}`}>Mainnet (LIVE)</button>
                </div>
            </Field>
            <Field label="API Key" error={fieldError === 'apiKey' ? error : undefined}>
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-base font-mono" />
            </Field>
            <Field label="API Secret" error={fieldError === 'apiSecret' ? error : undefined}>
                <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} className="input-base font-mono" />
            </Field>
            {broker === 'bitget' && (
                <Field label="Passphrase" error={fieldError === 'passphrase' ? error : undefined}>
                    <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="input-base font-mono" />
                </Field>
            )}
            {error && !fieldError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>
            )}
            <div className="flex gap-2 pt-2">
                <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">Cancel</button>
                <button type="button" disabled={!canSave} onClick={handleSave}
                        className={`flex-1 py-2 rounded font-semibold ${canSave ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    {saving ? 'Testing…' : 'Save & Verify'}
                </button>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({ label, error, children }) => (
    <label className="block">
        <span className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</span>
        {children}
        {error && <span className="block text-xs text-red-400 mt-1">{error}</span>}
    </label>
);

export default CryptoCredentialForm;
```

- [ ] **Step 3: Add `.input-base` utility**

Append to `src/index.css` (or existing tailwind layer file):

```css
@layer components {
    .input-base {
        @apply w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500;
    }
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd "My Project" && npx tsc --noEmit 2>&1 | grep -E "CryptoSection|CryptoCredentialForm" | head -5`
Expected: clean.

```bash
git add src/pages/broker-connect/sections/CryptoSection.tsx src/pages/broker-connect/wizards/CryptoCredentialForm.tsx src/index.css
git commit -m "feat(broker-connect): crypto section and add form for Binance/Bitget"
```

---

## Task 20: `ForexSection` + `MT5CredentialForm`

**Files:**
- Create: `src/pages/broker-connect/sections/ForexSection.tsx`
- Create: `src/pages/broker-connect/wizards/MT5CredentialForm.tsx`

- [ ] **Step 1: `ForexSection`** (same shape as CryptoSection, filter by `categoryOf === 'forex'`, empty state reads "Connect MetaTrader 5")

```tsx
// src/pages/broker-connect/sections/ForexSection.tsx
import React from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { categoryOf } from '../brokerMeta';
import CredentialCard from '../components/CredentialCard';
import { HealthEntry } from '../hooks/useHealthCheck';

interface Props {
    creds: BrokerCredentialInfo[];
    healthMap: Map<string, HealthEntry>;
    onTest: (id: string) => void;
    onRemove: (id: string) => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
    onAdd: () => void;
}

const ForexSection: React.FC<Props> = ({ creds, healthMap, onTest, onRemove, onAdd }) => {
    const items = creds.filter((c) => categoryOf(c.broker) === 'forex');
    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Forex (MetaTrader 5)</h2>
                {items.length > 0 && (
                    <button type="button" onClick={onAdd} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
                )}
            </div>
            {items.length === 0 ? (
                <button type="button" onClick={onAdd}
                        className="w-full p-6 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-gray-300 hover:border-gray-600">
                    Connect your MT5 broker account to trade forex and indices
                </button>
            ) : (
                <div className="space-y-2">
                    {items.map((c) => (
                        <CredentialCard key={c.id}
                                        credential={c}
                                        health={healthMap.get(c.id) ?? { status: 'untested' }}
                                        onTest={() => onTest(c.id)}
                                        onRemove={() => onRemove(c.id)} />
                    ))}
                </div>
            )}
        </section>
    );
};
export default ForexSection;
```

- [ ] **Step 2: `MT5CredentialForm`**

```tsx
// src/pages/broker-connect/wizards/MT5CredentialForm.tsx
import React, { useState } from 'react';
import { createBrokerCredential } from '../../../services/brokerCredentialService';

interface Props {
    onCancel: () => void;
    onSaved: () => void;
}

const MT5CredentialForm: React.FC<Props> = ({ onCancel, onSaved }) => {
    const [nickname, setNickname] = useState('');
    const [environment, setEnvironment] = useState<'demo' | 'live'>('demo');
    const [mt5Login, setLogin] = useState('');
    const [mt5Password, setPassword] = useState('');
    const [mt5Server, setServer] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSave = !!nickname && !!mt5Login && !!mt5Password && !!mt5Server && !saving;

    const handleSave = async () => {
        setSaving(true); setError(null);
        const r = await createBrokerCredential({
            broker: 'mt5', nickname, environment, mt5Login, mt5Password, mt5Server,
        });
        if ('error' in r) { setError(r.error); setSaving(false); return; }
        onSaved();
    };

    return (
        <div className="space-y-3">
            <Field label="Nickname">
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="input-base" />
            </Field>
            <Field label="Environment">
                <div className="flex gap-2">
                    <button type="button" onClick={() => setEnvironment('demo')}
                            className={`flex-1 py-2 rounded text-sm ${environment === 'demo' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-300'}`}>Demo</button>
                    <button type="button" onClick={() => setEnvironment('live')}
                            className={`flex-1 py-2 rounded text-sm ${environment === 'live' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-300'}`}>Live</button>
                </div>
            </Field>
            <Field label="Account Login"><input value={mt5Login} onChange={(e) => setLogin(e.target.value)} className="input-base font-mono" /></Field>
            <Field label="Password"><input type="password" value={mt5Password} onChange={(e) => setPassword(e.target.value)} className="input-base font-mono" /></Field>
            <Field label="Server" hint="e.g. ICMarkets-Demo, Pepperstone-Live">
                <input value={mt5Server} onChange={(e) => setServer(e.target.value)} className="input-base font-mono" />
            </Field>
            {error && <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>}
            <div className="flex gap-2 pt-2">
                <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">Cancel</button>
                <button type="button" disabled={!canSave} onClick={handleSave}
                        className={`flex-1 py-2 rounded font-semibold ${canSave ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    {saving ? 'Connecting…' : 'Save & Verify'}
                </button>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</span>
        {children}
        {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
);

export default MT5CredentialForm;
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/broker-connect/sections/ForexSection.tsx src/pages/broker-connect/wizards/MT5CredentialForm.tsx
git commit -m "feat(broker-connect): forex section and MT5 credential form"
```

---

## Task 21: `StockSection` + `IndianBrokerForm` (OAuth + direct API)

**Files:**
- Create: `src/pages/broker-connect/sections/StockSection.tsx`
- Create: `src/pages/broker-connect/wizards/IndianBrokerForm.tsx`

- [ ] **Step 1: `StockSection`** (same shape, filter indian category)

```tsx
// src/pages/broker-connect/sections/StockSection.tsx
import React from 'react';
import { BrokerCredentialInfo } from '../../../services/brokerCredentialService';
import { categoryOf } from '../brokerMeta';
import CredentialCard from '../components/CredentialCard';
import { HealthEntry } from '../hooks/useHealthCheck';

interface Props {
    creds: BrokerCredentialInfo[];
    healthMap: Map<string, HealthEntry>;
    onTest: (id: string) => void;
    onRemove: (id: string) => Promise<{ ok: true } | { error: string; code?: string; count?: number }>;
    onAdd: () => void;
}

const StockSection: React.FC<Props> = ({ creds, healthMap, onTest, onRemove, onAdd }) => {
    const items = creds.filter((c) => categoryOf(c.broker) === 'indian');
    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Indian Brokers</h2>
                {items.length > 0 && (
                    <button type="button" onClick={onAdd} className="text-xs text-blue-400 hover:text-blue-300">+ Add</button>
                )}
            </div>
            {items.length === 0 ? (
                <button type="button" onClick={onAdd}
                        className="w-full p-6 border border-dashed border-gray-700 rounded-xl text-gray-500 hover:text-gray-300 hover:border-gray-600">
                    Connect Zerodha, Angel One, Upstox, Dhan, or Fyers
                </button>
            ) : (
                <div className="space-y-2">
                    {items.map((c) => (
                        <CredentialCard key={c.id}
                                        credential={c}
                                        health={healthMap.get(c.id) ?? { status: 'untested' }}
                                        onTest={() => onTest(c.id)}
                                        onRemove={() => onRemove(c.id)} />
                    ))}
                </div>
            )}
        </section>
    );
};
export default StockSection;
```

- [ ] **Step 2: `IndianBrokerForm`** (handles both OAuth + direct-API)

```tsx
// src/pages/broker-connect/wizards/IndianBrokerForm.tsx
import React, { useEffect, useState } from 'react';
import { BrokerId, createBrokerCredential, startOAuth, completeOAuth } from '../../../services/brokerCredentialService';
import { BROKERS } from '../brokerMeta';

type IndianId = Extract<BrokerId, 'zerodha' | 'angelone' | 'upstox' | 'dhan' | 'fyers'>;
type OauthId = Extract<IndianId, 'zerodha' | 'upstox' | 'fyers'>;

interface Props {
    broker: IndianId;
    onCancel: () => void;
    onSaved: () => void;
}

const IndianBrokerForm: React.FC<Props> = ({ broker, onCancel, onSaved }) => {
    const meta = BROKERS[broker];
    const isOauth = meta.authMethod === 'oauth';
    const [nickname, setNickname] = useState('');
    const [apiKey, setApiKey] = useState('');            // used by both OAuth (client_id) and direct-API
    const [clientId, setClientId] = useState('');        // Angel One, Dhan
    const [accessToken, setAccessToken] = useState(''); // Dhan uses access token directly
    const [totpSecret, setTotp] = useState('');         // Angel One
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // OAuth callback handling: if URL has ?code= after this component mounts, process it.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        if (!code || !state || !isOauth) return;
        void (async () => {
            const r = await completeOAuth(broker as OauthId, code, state);
            if ('error' in r) setError(r.error);
            else if (!r.ok) setError(r.error ?? 'OAuth test failed');
            else onSaved();
        })();
    }, [broker, isOauth, onSaved]);

    const handleOauthStart = async () => {
        setSaving(true); setError(null);
        const r = await startOAuth(broker as OauthId, nickname, apiKey);
        if ('error' in r) { setError(r.error); setSaving(false); return; }
        window.location.href = r.authorizeUrl;
    };

    const handleDirectSave = async () => {
        setSaving(true); setError(null);
        const body: any = { broker, nickname, environment: 'live', apiKey };
        if (broker === 'angelone') {
            body.clientId = clientId; body.totpSecret = totpSecret;
        } else if (broker === 'dhan') {
            body.clientId = clientId; body.accessToken = accessToken;
        }
        const r = await createBrokerCredential(body);
        if ('error' in r) { setError(r.error); setSaving(false); return; }
        onSaved();
    };

    if (isOauth) {
        return (
            <div className="space-y-3">
                <Field label="Nickname"><input value={nickname} onChange={(e) => setNickname(e.target.value)} className="input-base" /></Field>
                <Field label={`${meta.name} API Key (from developer portal)`}>
                    <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-base font-mono" />
                </Field>
                {error && <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>}
                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">Cancel</button>
                    <button type="button" disabled={!nickname || !apiKey || saving} onClick={handleOauthStart}
                            className="flex-1 py-2 rounded font-semibold bg-blue-500 text-white hover:bg-blue-600">
                        Connect with {meta.name}
                    </button>
                </div>
            </div>
        );
    }

    // Direct-API: Angel One or Dhan
    return (
        <div className="space-y-3">
            <Field label="Nickname"><input value={nickname} onChange={(e) => setNickname(e.target.value)} className="input-base" /></Field>
            <Field label="API Key"><input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-base font-mono" /></Field>
            <Field label="Client ID"><input value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-base font-mono" /></Field>
            {broker === 'angelone' && (
                <Field label="TOTP Secret" hint="Scan QR in Angel One app settings to reveal">
                    <input type="password" value={totpSecret} onChange={(e) => setTotp(e.target.value)} className="input-base font-mono" />
                </Field>
            )}
            {broker === 'dhan' && (
                <Field label="Access Token"><input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="input-base font-mono" /></Field>
            )}
            {error && <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">{error}</div>}
            <div className="flex gap-2 pt-2">
                <button type="button" onClick={onCancel} className="flex-1 py-2 rounded bg-gray-700 text-gray-200">Cancel</button>
                <button type="button" disabled={saving || !nickname || !apiKey || !clientId} onClick={handleDirectSave}
                        className="flex-1 py-2 rounded font-semibold bg-blue-500 text-white hover:bg-blue-600">
                    {saving ? 'Verifying…' : 'Save & Verify'}
                </button>
            </div>
        </div>
    );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
    <label className="block">
        <span className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</span>
        {children}
        {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
);

export default IndianBrokerForm;
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/broker-connect/sections/StockSection.tsx src/pages/broker-connect/wizards/IndianBrokerForm.tsx
git commit -m "feat(broker-connect): stock section + Indian broker form (OAuth + direct API)"
```

---

## Task 22: `AddConnectionWizard`

**Files:**
- Create: `src/pages/broker-connect/wizards/AddConnectionWizard.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/pages/broker-connect/wizards/AddConnectionWizard.tsx
import React, { useState } from 'react';
import { BROKERS, Category } from '../brokerMeta';
import { BrokerId } from '../../../services/brokerCredentialService';
import BrokerIcon from '../components/BrokerIcon';
import CryptoCredentialForm from './CryptoCredentialForm';
import MT5CredentialForm from './MT5CredentialForm';
import IndianBrokerForm from './IndianBrokerForm';

interface Props {
    onClose: () => void;
    onAdded: () => void;
}

const CATEGORY_LABELS: Record<Category, string> = {
    crypto: 'Crypto Exchange',
    forex: 'Forex (MetaTrader 5)',
    indian: 'Indian Broker',
};

const AddConnectionWizard: React.FC<Props> = ({ onClose, onAdded }) => {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [category, setCategory] = useState<Category | null>(null);
    const [broker, setBroker] = useState<BrokerId | null>(null);

    const brokersInCategory = category
        ? Object.values(BROKERS).filter((b) => b.category === category)
        : [];

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-[#18181b] rounded-xl w-full max-w-md border border-gray-700 shadow-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">
                        {step === 1 ? 'Add Connection · Choose Category'
                            : step === 2 ? `Choose ${CATEGORY_LABELS[category!]}`
                                : `${BROKERS[broker!].name} Credentials`}
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                {step === 1 && (
                    <div className="space-y-2">
                        {(['crypto', 'forex', 'indian'] as Category[]).map((c) => (
                            <button type="button" key={c}
                                    onClick={() => { setCategory(c); setStep(2); }}
                                    className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-left text-white">
                                <div className="font-semibold">{CATEGORY_LABELS[c]}</div>
                                <div className="text-xs text-gray-400 mt-1">
                                    {c === 'crypto' && 'Binance, Bitget — spot and futures trading'}
                                    {c === 'forex' && 'MT5 broker account via MetaAPI'}
                                    {c === 'indian' && 'Zerodha, Angel One, Upstox, Dhan, Fyers'}
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-2">
                        {brokersInCategory.map((b) => (
                            <button type="button" key={b.id}
                                    onClick={() => { setBroker(b.id); setStep(3); }}
                                    className="w-full p-3 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center gap-3 text-left text-white">
                                <BrokerIcon broker={b.id} size="sm" />
                                <span className="font-semibold">{b.name}</span>
                            </button>
                        ))}
                        <button type="button" onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-300">← Back</button>
                    </div>
                )}

                {step === 3 && broker && category === 'crypto' && (
                    <CryptoCredentialForm
                        broker={broker as 'binance' | 'bitget'}
                        onCancel={() => setStep(2)}
                        onSaved={onAdded}
                    />
                )}
                {step === 3 && broker && category === 'forex' && (
                    <MT5CredentialForm onCancel={() => setStep(2)} onSaved={onAdded} />
                )}
                {step === 3 && broker && category === 'indian' && (
                    <IndianBrokerForm
                        broker={broker as 'zerodha' | 'angelone' | 'upstox' | 'dhan' | 'fyers'}
                        onCancel={() => setStep(2)}
                        onSaved={onAdded}
                    />
                )}
            </div>
        </div>
    );
};
export default AddConnectionWizard;
```

- [ ] **Step 2: Typecheck**

Run: `cd "My Project" && npx tsc --noEmit 2>&1 | grep "AddConnectionWizard" | head -5`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/broker-connect/wizards/AddConnectionWizard.tsx
git commit -m "feat(broker-connect): 3-step add-connection wizard"
```

---

## Task 23: Wire `BrokerConnectPage` into the Settings tab

**Files:**
- Modify: `src/pages/Settings.tsx` (or whichever file renders the Broker Connect tab)

- [ ] **Step 1: Locate the tab renderer**

Find where `ExchangeManagement` is rendered as the Broker Connect tab. Likely pattern (verify in the file):

```tsx
{activeTab === 'broker' && <ExchangeManagement />}
```

- [ ] **Step 2: Replace with new page**

```tsx
import BrokerConnectPage from './broker-connect/BrokerConnectPage';
// ...
{activeTab === 'broker' && <BrokerConnectPage />}
```

- [ ] **Step 3: Visual smoke test**

Run dev server (`pnpm dev`), open `/settings`, click Broker Connect tab. Expect:
- Page loads with header + 3 sections
- Existing credentials appear in the right section
- Testing one flips the badge to Connected/Disconnected with latency/error
- Add Connection opens the wizard

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(settings): mount new BrokerConnectPage in broker connect tab"
```

---

## Task 24: Remove legacy files

**Files (delete):**
- `src/pages/ExchangeManagement.tsx`
- `src/pages/BrokerSettings.tsx`
- `src/components/AddBrokerCredentialModal.tsx`
- `src/services/exchangeService.ts` — only if no other code imports it; otherwise trim to helpers still in use
- `backend/server/src/services/credentialBridge.ts`
- `backend/server/src/services/mt5Connector.ts`
- `backend/server/src/services/indianBrokerConnector.ts`
- `backend/server/src/services/oauthBrokers.ts`
- `backend/server/src/services/exchangeConnector.ts` — only after verifying no usages remain (encryption helpers moved into the migration script itself; runtime code uses credentialVault)
- `backend/server/src/routes/` legacy `/api/exchange/*` and `/api/oauth/*` handlers (if they live inline in `index.ts`)

**Files (modify):**
- `backend/server/src/index.ts` — remove imports and `app.use` lines for legacy routes
- `vite.config.ts` — remove `/api/exchange` and `/api/oauth` proxy entries
- `src/components/MainLayout.tsx` — remove `/settings/brokers` route (page was a stopgap)

- [ ] **Step 1: Find and remove each file**

```bash
grep -r --include="*.ts" --include="*.tsx" "ExchangeManagement" src/
grep -r --include="*.ts" --include="*.tsx" "BrokerSettings" src/
grep -r --include="*.ts" --include="*.tsx" "credentialBridge" backend/server/src/
```
For each hit outside the files being deleted: update the import to the new source, or delete the usage if it's dead code.

- [ ] **Step 2: Delete the files**

```bash
rm src/pages/ExchangeManagement.tsx src/pages/BrokerSettings.tsx
rm src/components/AddBrokerCredentialModal.tsx
rm backend/server/src/services/credentialBridge.ts
rm backend/server/src/services/mt5Connector.ts
rm backend/server/src/services/indianBrokerConnector.ts
rm backend/server/src/services/oauthBrokers.ts
```

- [ ] **Step 3: Clean `index.ts`**

Remove:
- `import { testConnection, encryptKeyFields } from './services/exchangeConnector';`
- `import { testMT5Connection, encryptMT5Fields } from './services/mt5Connector';`
- `import { isIndianBroker, testIndianBrokerConnection, encryptIndianBrokerFields } from './services/indianBrokerConnector';`
- `import { getUpstoxAuthUrl, handleUpstoxCallback, getFyersAuthUrl, handleFyersCallback, getZerodhaAuthUrl, handleZerodhaCallback, getOAuthStatus } from './services/oauthBrokers';`
- `app.post('/api/exchange/test', …)`, `app.post('/api/exchange/encrypt-keys', …)`, and all `/api/oauth/*` handlers

- [ ] **Step 4: Clean `vite.config.ts`**

Remove these proxy entries:
```
'/api/exchange': { ... },
'/api/oauth': { ... },
```

- [ ] **Step 5: Remove `/settings/brokers` route**

Edit `src/components/MainLayout.tsx`: delete the line:
```tsx
<ReactRouterDOM.Route path="/settings/brokers" element={<BrokerSettings />} />
```
and the matching import.

- [ ] **Step 6: Typecheck both**

```bash
cd backend/server && npx tsc --noEmit
cd ../.. && npx tsc --noEmit
```
Expected: clean (or only pre-existing unrelated errors).

- [ ] **Step 7: Smoke-run dev servers**

Run both `pnpm dev` and `npm run dev` in backend. Visit `/settings` → broker connect tab → page loads; `/settings/brokers` → 404 or redirect; existing creds still visible.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove legacy broker connect code and routes"
```

---

## Task 25: Migration 068 — drop `user_exchange_keys` table

**Files:**
- Create: `backend/schema/068_drop_user_exchange_keys.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 068_drop_user_exchange_keys.sql
-- Legacy table retired. All production data has been copied into
-- user_exchange_keys_v2 via migration 067. Verified with verifyMigration067.ts.

BEGIN;

-- Drop policies first (if any existed).
DROP POLICY IF EXISTS "Users manage their exchange keys" ON user_exchange_keys;

DROP TABLE IF EXISTS user_exchange_keys;

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Run against the dev database. Verify with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_exchange_keys';
```
Expected: 0 rows.

- [ ] **Step 3: Commit**

```bash
git add backend/schema/068_drop_user_exchange_keys.sql
git commit -m "chore(schema): 068 drop user_exchange_keys after v2 consolidation"
```

---

## Task 26: Manual verification checklist

- [ ] **Binance Demo flow:**
   1. Open `/settings` → Broker Connect tab.
   2. Click "+ Add Connection" → Crypto → Binance.
   3. Fill nickname, switch Environment to Testnet, paste demo API key/secret.
   4. Click "Save & Verify". Wait.
   5. Expected: Wizard closes, new card appears in Crypto section with green Connected badge, latency shown.

- [ ] **Revocation flow:**
   1. On `demo.binance.com`, revoke the API key.
   2. On `/settings` Broker Connect, click "Test Connection" on the Binance card.
   3. Expected: card flips to red Disconnected with "Invalid Api-Key ID" inline text.
   4. Hard-refresh the page — badge remains red (persisted) and a fresh test on load re-confirms.

- [ ] **Page-load parallel tests:**
   1. Add two crypto credentials and one MT5 credential.
   2. Hard-refresh the page.
   3. Expected: all three cards briefly show "Testing…" (blue pulsing), then resolve to their individual statuses. A slow broker does not block the fast one.

- [ ] **MT5 flow:**
   1. Add Connection → Forex → MT5. Use a known-good demo login (broker portal).
   2. Expected: Connected green with balance preview (currency + number).

- [ ] **Zerodha OAuth flow:**
   1. Add Connection → Indian Broker → Zerodha.
   2. Fill nickname + API Key, click "Connect with Zerodha".
   3. Complete login in the redirect tab.
   4. Expected: return to `/settings` Broker Connect with new Zerodha card, Connected.

- [ ] **Delete guard:**
   1. Execute a signal using the Binance credential (manual via Execute modal).
   2. While it is still Active, click Remove on that card → Confirm delete.
   3. Expected: card shows "Blocked: 1 active executions use this. Close them first." Deletion does not happen.

- [ ] **Legacy endpoints retired:**
   1. `curl -i http://localhost:4000/api/exchange/test` → 404 from Express.
   2. `/api/oauth/upstox/start` → 404.

- [ ] **Typecheck + commit:**

```bash
cd backend/server && npx tsc --noEmit
cd ../.. && npx tsc --noEmit
git add -A
git commit --allow-empty -m "chore: manual verification of broker connect rebuild complete"
```

---

## Self-review notes

**Spec coverage:**
- All 8 brokers: Tasks 4–7 + 19–22 ✓
- Schema consolidation: Tasks 1, 2, 13, 25 ✓
- Test-on-load: Tasks 9 + 15 (useHealthCheck) ✓
- Error propagation fix: Task 8 (route returns result shape unchanged); frontend service in Task 15 exposes ok/error cleanly
- Delete safety: Task 11 ✓
- OAuth expiry UX: handled by `IndianBrokerForm` OAuth branch + `testIndianBroker` returning `Token expired` as error; surfaced by `HealthBadge`
- Manual verification checklist: Task 26 ✓

**Placeholder check:** No `TBD`, no "implement later", no "similar to Task N". Every code block is complete.

**Type consistency:** `BrokerCredentialsFull` (vault), `BrokerCredentialInfo` (service), `TestResult` (server + client), `HealthEntry` (hook), `HealthStatus` enum — names match across tasks.

**Scope:** 26 tasks for a page rebuild + schema consolidation is on the larger side but every task is self-contained with its own tests or manual verification.
