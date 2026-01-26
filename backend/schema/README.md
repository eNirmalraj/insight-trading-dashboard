# Backend Schema

This directory contains the PostgreSQL schema for Insight Trading's Supabase backend.

## Files

| File | Description |
|------|-------------|
| `001_complete_schema.sql` | Complete database schema with tables, RLS, triggers |
| `002_seed_data.sql` | Sample data for development testing |

## Schema Overview

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

## Deployment

### Option 1: Supabase Dashboard
1. Go to SQL Editor in Supabase Dashboard
2. Paste contents of `001_complete_schema.sql`
3. Run the query

### Option 2: Supabase CLI
```bash
supabase db push
```

## RLS Policies

| Table | Policy |
|-------|--------|
| profiles | User can only access own profile |
| watchlists | User can only access own watchlists |
| watchlist_items | User can only access items in own watchlists |
| positions | User can only access own positions |
| signals | All authenticated users can read |

## Triggers

- **on_auth_user_created**: Auto-creates profile row when user signs up
- **set_*_updated_at**: Auto-updates `updated_at` timestamp on row changes
