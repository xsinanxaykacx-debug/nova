-- WebRTC call signaling. Media is peer-to-peer; Supabase carries signaling only.
create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer', 'answer', 'ice')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint call_signals_distinct_participants check (sender_id <> receiver_id)
);

create index if not exists call_signals_call_id_idx
  on public.call_signals (call_id);
create index if not exists call_signals_receiver_id_idx
  on public.call_signals (receiver_id);

alter table public.call_signals enable row level security;

create policy "Call participants can read their signals"
  on public.call_signals for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can create signals as themselves"
  on public.call_signals for insert
  to authenticated
  with check (auth.uid() = sender_id and sender_id <> receiver_id);

create policy "Call participants can delete their signals"
  on public.call_signals for delete
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Private Realtime broadcast topics are authorized against the call's seed offer row.
create policy "Call participants can receive private call broadcasts"
  on realtime.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.call_signals cs
      where cs.call_id::text = split_part(realtime.topic(), ':', 2)
        and auth.uid() in (cs.sender_id, cs.receiver_id)
    )
  );

create policy "Call participants can send private call broadcasts"
  on realtime.messages for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.call_signals cs
      where cs.call_id::text = split_part(realtime.topic(), ':', 2)
        and auth.uid() in (cs.sender_id, cs.receiver_id)
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;
end
$$;
