# Backend Integration Guide

This document explains the architecture for integrating a real backend with Insight Trading.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                           api.ts                                 │
│                    (Thin Routing Layer)                          │
├────────────────────────┬────────────────────────────────────────┤
│    src/mock/mockApi.ts │     src/services/apiClient.ts          │
│    (Mock Data Layer)   │     (HTTP Client for Supabase)         │
└────────────────────────┴────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Backend                             │
├─────────────────────────────────────────────────────────────────┤
│  • PostgreSQL Database                                           │
│  • Row Level Security (RLS)                                      │
│  • Edge Functions                                                │
│  • Real-time Subscriptions                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

The complete schema is in `/backend/schema/001_complete_schema.sql`:

```
auth.users (Supabase)
    │
    ▼ (auto-created via trigger)
profiles
    │
    ├──► watchlists ──► watchlist_items
    │
    └──► positions

signals (globally readable)
```

### Tables

| Table | Description | RLS Policy |
|-------|-------------|------------|
| `profiles` | User profiles (extends auth.users) | User's own data only |
| `watchlists` | User watchlists | User's own data only |
| `watchlist_items` | Items in watchlists | User's own data only |
| `positions` | Trading positions | User's own data only |
| `signals` | Trading signals | Readable by all authenticated |

## Environment Configuration

Configure these environment variables in `.env.local`:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Toggle between mock and real backend
VITE_USE_MOCK_API=true  # Set to 'false' for real backend
```

## Switching to Real Backend

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Copy your project URL and anon key

### Step 2: Deploy Database Schema

Run the SQL in Supabase Dashboard → SQL Editor:

```sql
-- Copy contents of /backend/schema/001_complete_schema.sql
```

Or use Supabase CLI:
```bash
supabase db push
```

### Step 3: Set Environment Variables

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_USE_MOCK_API=false
```

### Step 4: Update api.ts

Modify `api.ts` to conditionally route to real API:

```typescript
import { shouldUseMockApi } from './src/services/apiClient';
import * as mockApi from './src/mock/mockApi';
import { apiClient } from './src/services/apiClient';

export const getPositions = async () => {
  if (shouldUseMockApi()) {
    return mockApi.getPositions();
  }
  return apiClient.get('/rest/v1/positions');
};
```

## RLS Policies

All tables have Row Level Security enabled:

- **profiles**: Users can only SELECT/UPDATE their own profile
- **watchlists**: Full CRUD access to own watchlists only
- **watchlist_items**: Access based on watchlist ownership
- **positions**: Full CRUD access to own positions only
- **signals**: All authenticated users can read (admin-only insert/update)

## Triggers

| Trigger | Description |
|---------|-------------|
| `on_auth_user_created` | Auto-creates profile when user signs up |
| `set_*_updated_at` | Auto-updates `updated_at` on row changes |

## API Client Usage

The `apiClient` (`src/services/apiClient.ts`) provides:

```typescript
import { apiClient } from './src/services/apiClient';

// GET request
const positions = await apiClient.get<Position[]>('/rest/v1/positions');

// POST request
const newPosition = await apiClient.post<Position>('/rest/v1/positions', {
  symbol: 'EURUSD',
  direction: 'BUY',
  quantity: 0.1,
});

// PUT request
await apiClient.put(`/rest/v1/positions?id=eq.${id}`, { stop_loss: 1.0850 });

// DELETE request
await apiClient.delete(`/rest/v1/positions?id=eq.${id}`);
```

## File Structure

```
insight-trading/
├── api.ts                          # Thin routing layer
├── src/
│   ├── services/
│   │   ├── apiClient.ts            # HTTP client for Supabase
│   │   ├── supabaseClient.ts       # Supabase SDK initialization
│   │   └── authService.ts          # Authentication service
│   ├── mock/
│   │   └── mockApi.ts              # Mock data layer
│   ├── context/
│   │   └── AuthContext.tsx         # React auth context
│   └── hooks/                      # React hooks (to be implemented)
├── backend/
│   ├── schema/
│   │   ├── 001_complete_schema.sql # Database schema + RLS + triggers
│   │   └── 002_seed_data.sql       # Sample data for testing
│   └── functions/                  # Edge functions (placeholder)
└── .env.local                      # Environment configuration
```

## Next Steps

1. ✅ **Create Supabase Project** - Set up at supabase.com
2. ✅ **Database Schema** - Deploy `001_complete_schema.sql`
3. ✅ **RLS Policies** - Included in schema file
4. ⬜ **Migrate Functions** - Convert mock functions to real API calls
5. ✅ **Authentication** - Supabase Auth integrated
6. ⬜ **Enable Real-time** - Subscribe to database changes for live updates
