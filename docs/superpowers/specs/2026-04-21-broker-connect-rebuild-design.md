# Broker Connect Page Rebuild — Design Spec

**Date:** 2026-04-21
**Status:** Approved for planning
**Owner:** nirmalraj2328@gmail.com

## Goal

Rebuild the Broker Connect page with a clean component split, a single credential table, honest connection-health reporting, and a polished section-based UI that supports all 8 existing broker integrations.

## Scope

**In scope:**
- New page at `/settings` (Broker Connect tab) replacing `ExchangeManagement.tsx`
- Support for all current integrations: Binance, Bitget, MT5, Zerodha, Angel One, Upstox, Dhan, Fyers
- Consolidation onto a single credential table (`user_exchange_keys_v2`, vault-encrypted via pgsodium)
- Fresh connection-health check on every page load (parallel, per-credential)
- Unified `/api/broker-credentials` REST surface; removal of legacy `/api/exchange/*` routes
- Honest end-to-end error propagation (backend `ok:false` flows reliably to red UI state)
- Removal of `ExchangeManagement.tsx`, `BrokerSettings.tsx`, `user_exchange_keys` table, and `credentialBridge.ts`

**Out of scope:**
- New broker integrations beyond the current 8
- Server-side background health job (nightly re-test + email alerts) — deferred
- Balance dashboards, P&L attribution per broker — deferred
- Mid-session auto re-test interval — deferred (noted as easy add-on later)
- Per-credential IP-restriction helper UI — deferred

## Architecture Overview

```
┌───────────────── Frontend (Vite/React) ─────────────────┐
│  /settings → Broker Connect tab                          │
│                                                          │
│  BrokerConnectPage                                       │
│   ├─ BrokerConnectHeader  (summary + global + Add)       │
│   ├─ CryptoSection        (Binance, Bitget)              │
│   ├─ ForexSection         (MT5)                          │
│   ├─ StockSection         (Zerodha/Angel One/Upstox/…)   │
│   └─ AddConnectionWizard  (lazy-mounted)                 │
│                                                          │
│  useBrokerCredentials()   — CRUD, optimistic updates     │
│  useHealthCheck()         — Promise.allSettled batch     │
└──────────────────────────┬───────────────────────────────┘
                           │ fetch /api/broker-credentials
                           ▼
┌───────────────── Backend (Express) ──────────────────────┐
│  POST /api/broker-credentials/test-batch  ──► allSettled │
│  credentialHealth.testCredential()                       │
│   ├─ testBinance   (binanceusdm, demo-fapi routing)      │
│   ├─ testBitget    (ccxt.bitget)                         │
│   ├─ testMT5       (MetaAPI)                             │
│   └─ testIndianBroker (per-broker dispatch)              │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌───────────────── Supabase (pgsodium) ────────────────────┐
│  user_exchange_keys_v2   — single source of truth        │
└──────────────────────────────────────────────────────────┘
```

## UI / Visual Design

### Page structure

- **Header:** Title, description, summary strip (total / healthy / disconnected), global `+ Add Connection` button.
- **Three sections stacked**: Crypto Exchanges → Forex (MT5) → Indian Brokers. Each section has its own heading, scoped add button, and empty state.
- **Credential card** (the atomic list item):
  - Broker icon (2-letter brand-colored avatar), nickname, environment pill (Testnet / Live / Demo), health badge (dot + status word + latency/error).
  - Meta row: broker name · `***<last4>` key preview · last tested timestamp.
  - Permission chips row (Read / Futures / Futures Trading / Spot), shown only when populated.
  - Actions row: `Test`, `Edit`, `Remove`. For expired-OAuth brokers: `Re-authorize` replaces `Test`.
- **Design tokens**: dark theme matches rest of app (`bg-dark-bg` page, `bg-[#18181b]` cards, `border-gray-800`, `rounded-xl`, hover lift via `hover:border-gray-700`).

### Health states (badge colors)

| State | Color | When |
|---|---|---|
| Connected | Green | `is_active=true` AND `last_test_status='success'` |
| Disconnected | Red | `is_active=true` AND `last_test_status='failed'` |
| Untested | Yellow | `is_active=true` AND `last_test_status IS NULL` |
| Paused | Gray | `is_active=false` |
| Testing | Blue (animated) | test request in flight |

### Add Connection wizard (three steps)

1. **Category** — Crypto / Forex / Indian Brokers (cards with icons).
2. **Broker** — shows the brokers in that category; each with logo and short description.
3. **Form** — broker-specific fields (see forms below). Submit runs a test before persisting; persist only if test succeeds, else show the error inline without closing the wizard.

### Credential forms

- **Crypto (Binance, Bitget):** nickname, API key, API secret, optional passphrase (Bitget), environment toggle (Testnet / Mainnet).
- **MT5:** nickname, login, password, server (free-text input with placeholder like `ICMarkets-Demo`; a searchable preset list can be added later — MetaAPI exposes the broker list but first release ships with free-text).
- **Indian brokers:**
  - Zerodha / Fyers / Upstox: nickname + "Connect with [Broker]" button → OAuth flow → callback returns and stores token.
  - Angel One: nickname, API key, Client ID, MPIN (passphrase), TOTP secret — all stored encrypted.
  - Dhan: nickname, API key, Client ID.

## Component Architecture

```
src/pages/broker-connect/
├── BrokerConnectPage.tsx
├── BrokerConnectHeader.tsx
├── sections/
│   ├── CryptoSection.tsx
│   ├── ForexSection.tsx
│   └── StockSection.tsx
├── components/
│   ├── CredentialCard.tsx
│   ├── HealthBadge.tsx
│   ├── BrokerIcon.tsx
│   └── PermissionChips.tsx
├── wizards/
│   ├── AddConnectionWizard.tsx
│   ├── CryptoCredentialForm.tsx
│   ├── MT5CredentialForm.tsx
│   └── IndianBrokerForm.tsx
└── hooks/
    ├── useBrokerCredentials.ts
    └── useHealthCheck.ts
```

### Component contracts

```ts
// CredentialCard
interface CredentialCardProps {
    credential: BrokerCredentialInfo;
    status: HealthStatus;              // 'connected' | 'disconnected' | 'untested' | 'testing'
    latencyMs?: number;
    error?: string;
    onTest: () => void;
    onEdit: () => void;
    onRemove: () => void;
    onReauth?: () => void;             // only for OAuth brokers in 'token_expired' state
}

// HealthBadge
interface HealthBadgeProps {
    status: HealthStatus;
    latencyMs?: number;
    error?: string;
}

// BrokerCredentialInfo (returned from GET /api/broker-credentials)
interface BrokerCredentialInfo {
    id: string;
    broker: BrokerId;
    nickname: string;
    environment: 'testnet' | 'live' | 'mainnet' | 'demo' | null;
    is_active: boolean;
    last_test_status: 'success' | 'failed' | null;
    last_test_error: string | null;
    last_verified_at: string | null;
    permissions: string[];
    api_key_preview: string;           // last 4 chars only
}
```

### State ownership

- `BrokerConnectPage` owns the credentials list and the health map (`Map<id, TestResult>`).
- On mount: GET credentials → trigger batch health check → update health map as the response lands.
- Card actions mutate through `useBrokerCredentials` (POST/PATCH/DELETE) with optimistic UI + rollback on error.
- Wizards are lazily rendered (`{showAdd && <AddConnectionWizard />}`).

## Backend: Schema Consolidation

### Migration 066: extend v2 schema

```sql
ALTER TABLE user_exchange_keys_v2
  ADD COLUMN environment text
      CHECK (environment IN ('testnet', 'live', 'mainnet', 'demo')),
  ADD COLUMN passphrase_encrypted bytea,
  ADD COLUMN mt5_login text,
  ADD COLUMN mt5_password_encrypted bytea,
  ADD COLUMN mt5_server text,
  ADD COLUMN client_id text,
  ADD COLUMN access_token_encrypted bytea,
  ADD COLUMN totp_secret_encrypted bytea,
  ADD COLUMN permissions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN last_test_status text,
  ADD COLUMN last_test_error text;

-- Expand broker check to cover all 8 integrations
ALTER TABLE user_exchange_keys_v2
  DROP CONSTRAINT IF EXISTS user_exchange_keys_v2_broker_check;
ALTER TABLE user_exchange_keys_v2
  ADD CONSTRAINT user_exchange_keys_v2_broker_check CHECK (
    broker IN ('binance', 'bitget', 'mt5',
               'zerodha', 'angelone', 'upstox', 'dhan', 'fyers')
  );
```

### Migration 067: data migration TS script

`backend/server/scripts/migrateLegacyCredentials.ts`:

1. Select all rows from `user_exchange_keys`.
2. For each row: decrypt secrets using the legacy `EXCHANGE_ENCRYPTION_KEY`, then re-encrypt via pgsodium RPC (`credential_encrypt`), then insert into `user_exchange_keys_v2` mapping the column differences (`exchange`→`broker`, environment carries over unchanged).
3. Idempotent guard: skip rows where a `(user_id, broker, nickname)` tuple already exists in v2.
4. On success, update a `migrations_log` row recording the run.
5. Script prints a summary: `N rows copied, M skipped, 0 errors` and exits nonzero on any error.

### Migration 068: drop legacy table + routes

After manual verification that the new page works end-to-end:
```sql
DROP TABLE user_exchange_keys;
```
Backend code removal: `routes/exchange*.ts`, `services/exchangeConnector.ts` legacy paths, `credentialBridge.ts`.

## Backend: API Surface

All under `/api/broker-credentials`:

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/` | — | `{ credentials: BrokerCredentialInfo[] }` |
| POST | `/` | `{ broker, nickname, environment, apiKey?, apiSecret?, passphrase?, mt5Login?, mt5Password?, mt5Server?, clientId?, totpSecret? }` | `{ id }` after a successful connection test; `{ error, code }` otherwise |
| PATCH | `/:id` | partial update of nickname / environment / credentials | `{ id }` |
| DELETE | `/:id` | — | `{ ok: true }` (or `{ error: 'active_executions', count: N }` when in use) |
| POST | `/:id/test` | — | `{ ok, latencyMs, permissions, error? }` |
| POST | `/test-batch` | `{ ids: string[] }` | `{ results: Array<{ id, ok, latencyMs, permissions, error? }> }` |
| POST | `/oauth/:broker/start` | `{ nickname }` | `{ authorizeUrl }` |
| POST | `/oauth/:broker/callback` | `{ code, state }` | `{ id }` |

Auth: Bearer token (Supabase session), same pattern as existing `broker-credentials` routes.

Secrets never leave the server. `api_key_preview` is computed server-side by decrypting in memory and taking the last 4 characters, exactly once per GET.

## Backend: Health Testing

### Unified dispatcher

```ts
// services/credentialHealth.ts
export interface TestResult {
    ok: boolean;
    latencyMs: number;
    permissions: string[];
    error?: string;
}

export async function testCredential(id: string): Promise<TestResult> {
    const cred = await credentialVault.retrieveById(id);
    if (!cred) return { ok: false, latencyMs: 0, permissions: [], error: 'Credential not found' };
    switch (cred.broker) {
        case 'binance':  return testBinance(cred);
        case 'bitget':   return testBitget(cred);
        case 'mt5':      return testMT5(cred);
        case 'zerodha':
        case 'angelone':
        case 'upstox':
        case 'dhan':
        case 'fyers':    return testIndianBroker(cred);
    }
}
```

### Route handler writes status

After a successful or failed test, the route handler (not the tester) updates `last_test_status`, `last_test_error`, `permissions`, and `last_verified_at` on the row. This centralizes write logic; the testers are pure and side-effect free.

### Batch endpoint

```ts
router.post('/test-batch', async (req, res) => {
    const ids = req.body.ids as string[];
    const settled = await Promise.allSettled(ids.map(testCredential));
    const results = settled.map((s, i) => ({
        id: ids[i],
        ...(s.status === 'fulfilled'
            ? s.value
            : { ok: false, latencyMs: 0, permissions: [], error: String(s.reason) }),
    }));
    // persist updates in parallel, don't block the response
    void persistResults(results);
    return res.json({ results });
});
```

The frontend receives all results at once; `useHealthCheck` populates the health map then re-renders.

### Binance testnet routing

Already fixed in this session: `binanceusdm` with manual URL override to `https://demo-fapi.binance.com` for `environment='testnet'`. Carries over untouched into the rebuild.

## Error Handling

| Scenario | Behavior |
|---|---|
| Broker rejects key (`-2008`, `-2015`, etc.) | `ok:false`, error surfaced to badge, `last_test_status='failed'` persisted |
| Transient network / timeout during test | `ok:false`, error `'network'`, `last_test_status` **not** persisted (no false negative) |
| Credential in use by active execution, user tries delete | Server returns `{ error: 'active_executions', count: N }` → frontend shows confirmation dialog explaining closure options |
| Toggle off a Disconnected cred | Allowed; `is_active=false` excludes it from Execute modal dropdown |
| OAuth token expired (Upstox/Fyers/Zerodha) | Tester returns `error: 'Token expired'` → card shows `Re-authorize` button that re-enters OAuth flow for the same row |
| Backend returns HTTP 200 with `ok:false` | Frontend wrapper checks `data.ok` (this session's bug — permanently closed) |
| Concurrent edits from two tabs | Idempotent writes; last write wins for `nickname`/`environment`; test results are append-only per timestamp |
| Malformed create payload | Server validates broker-specific required fields; returns `{ error, code: 'validation', field: 'apiKey' }` for inline field errors |

## Testing Strategy

### Backend

- **Unit: `credentialHealth.testCredential`** — mock ccxt, assert Invalid-Key error flows to `ok:false` + correct error string (the specific bug from this session).
- **Unit: each per-broker tester** — mock the external call surface (fetch / ccxt / MetaAPI), cover happy path + 4+ failure modes each.
- **Integration: `/test-batch`** — dispatch 3 IDs with mixed outcomes (success, failure, simulated 10s timeout), assert all three results returned within timeout budget.
- **Migration test:** run `066` + TS data migration against a seeded legacy table in a disposable Supabase schema, assert row count match and round-trip decrypt equality.

### Frontend

- **Component: `CredentialCard`** — snapshot each of the 4 visible status states.
- **Component: `HealthBadge`** — asserts color class + latency formatting + long-error truncation.
- **Hook: `useHealthCheck`** — mocks batch response, asserts `Map<id, result>` population order-independent.
- **E2E smoke (Playwright or vitest + msw):** add Binance Testnet → see Connected → mock revoke → click Test → see Disconnected with real error text.

### Manual verification checklist (blocking merge)

1. Add Binance Demo key via wizard → Connected green with latency shown.
2. Delete key on `demo.binance.com` → click Test → Disconnected red with "Invalid Api-Key ID" shown.
3. Hard-refresh page → all cards auto-re-tested in parallel, badges reflect current truth.
4. Add MT5 via MetaAPI → test returns account balance + broker name.
5. Start Zerodha OAuth → complete callback → card appears Connected without manual key entry.
6. Delete credential with 1 active execution → confirmation dialog appears, Delete blocked until exec closes.
7. Verify legacy `/api/exchange/test` returns 404 (routes removed).
8. Verify `user_exchange_keys` table is dropped.

## Implementation Order (informs the plan)

1. Backend: migration 066 (schema extend).
2. Backend: unified `credentialHealth.testCredential` + per-broker testers.
3. Backend: `/api/broker-credentials/test-batch` endpoint.
4. Backend: expand existing POST / PATCH / DELETE routes to handle all broker shapes.
5. Backend: OAuth start/callback routes.
6. Backend: migration 067 data script + execution.
7. Frontend: new page scaffold, hooks, CredentialCard, HealthBadge, BrokerIcon.
8. Frontend: CryptoSection (simplest category, smoke-test the pattern).
9. Frontend: ForexSection + MT5 form.
10. Frontend: StockSection + Indian broker forms + OAuth flow.
11. Frontend: AddConnectionWizard wiring across all sections.
12. Cleanup: delete `ExchangeManagement.tsx`, `BrokerSettings.tsx`, `credentialBridge.ts`, `routes/exchange*.ts`, legacy table (migration 068).
13. Manual verification checklist → merge.

Each task above is roughly self-contained and testable on its own.
