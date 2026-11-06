create table if not exists public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'web' check (platform in ('web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists fcm_tokens_user_id_idx
  on public.fcm_tokens (user_id);

alter table public.fcm_tokens enable row level security;

drop policy if exists "Users can read their own FCM tokens" on public.fcm_tokens;
create policy "Users can read their own FCM tokens"
  on public.fcm_tokens for select using (auth.uid() = user_id);

drop policy if exists "Users can register their own FCM tokens" on public.fcm_tokens;
create policy "Users can register their own FCM tokens"
  on public.fcm_tokens for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own FCM tokens" on public.fcm_tokens;
create policy "Users can update their own FCM tokens"
  on public.fcm_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own FCM tokens" on public.fcm_tokens;
create policy "Users can delete their own FCM tokens"
  on public.fcm_tokens for delete using (auth.uid() = user_id);
