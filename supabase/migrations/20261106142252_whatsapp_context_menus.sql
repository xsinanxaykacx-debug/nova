-- Per-member conversation controls and per-user message actions.
alter table public.conversation_members
  add column if not exists archived_at timestamptz,
  add column if not exists pinned_at timestamptz,
  add column if not exists favorite_at timestamptz,
  add column if not exists unread_at timestamptz,
  add column if not exists cleared_at timestamptz;

create table if not exists public.message_user_state (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz,
  starred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_user_state enable row level security;
grant select, insert, update, delete on public.message_user_state to authenticated;

create policy message_user_state_select_own
  on public.message_user_state for select to authenticated
  using (user_id = (select auth.uid()));

create policy message_user_state_insert_own
  on public.message_user_state for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (select private.is_conversation_member(m.conversation_id))
    )
  );

create policy message_user_state_update_own
  on public.message_user_state for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (select private.is_conversation_member(m.conversation_id))
    )
  );

create policy message_user_state_delete_own
  on public.message_user_state for delete to authenticated
  using (user_id = (select auth.uid()));

-- Extend the existing self-update grant for per-user conversation controls.
grant update (archived_at, pinned_at, favorite_at, unread_at, cleared_at)
  on table public.conversation_members to authenticated;
