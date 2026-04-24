-- 071_user_favorite_symbols.sql
-- User-scoped favorite symbols for the Symbol Search modal.

create table public.user_favorite_symbols (
    user_id uuid references auth.users(id) on delete cascade,
    symbol text not null,
    added_at timestamptz default now() not null,
    primary key (user_id, symbol)
);

alter table public.user_favorite_symbols enable row level security;

create policy "users manage own favorites"
    on public.user_favorite_symbols
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index user_favorite_symbols_user_idx
    on public.user_favorite_symbols (user_id);
