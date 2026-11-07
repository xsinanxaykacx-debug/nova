-- Persistent call history shared by both participants.
create table if not exists public.call_history (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('voice', 'video')),
  status text not null default 'ringing' check (status in ('ringing', 'answered', 'rejected', 'missed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint call_history_distinct_participants check (caller_id <> callee_id)
);

create index if not exists call_history_caller_started_idx on public.call_history (caller_id, started_at desc);
create index if not exists call_history_callee_started_idx on public.call_history (callee_id, started_at desc);

alter table public.call_history enable row level security;
grant select, insert on table public.call_history to authenticated;
grant update (status, ended_at) on table public.call_history to authenticated;

create policy "Call participants can read their history" on public.call_history
  for select to authenticated using (auth.uid() = caller_id or auth.uid() = callee_id);
create policy "Callers can create their call history" on public.call_history
  for insert to authenticated with check (auth.uid() = caller_id and caller_id <> callee_id);
create policy "Call participants can update call outcomes" on public.call_history
  for update to authenticated using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'call_history') then
    alter publication supabase_realtime add table public.call_history;
  end if;
end
$$;
