-- NOVA MVP-03: ciphertext-first direct/group conversation foundation.
-- Private-message bodies are ciphertext only. No plaintext content column exists.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  sender_device_id uuid not null,
  created_at timestamptz not null default now(),
  constraint messages_ciphertext_not_empty check (length(ciphertext) > 0)
);

create index conversation_members_user_conversation_idx
  on public.conversation_members (user_id, conversation_id);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Least-privilege Data API grants. Membership creation is only through the
-- authenticated RPC below; clients cannot add themselves to arbitrary chats.
revoke all on table public.conversations, public.conversation_members, public.messages
  from anon, authenticated;
grant select on table public.conversations, public.conversation_members, public.messages
  to authenticated;
grant insert on table public.messages to authenticated;

-- SECURITY DEFINER avoids recursive RLS when a policy checks the membership
-- table itself. The function is isolated in a non-exposed schema and bound to
-- the caller's auth.uid().
create or replace function private.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_conversation_member(uuid) from public, anon, authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;

create policy conversations_select_members
  on public.conversations
  for select
  to authenticated
  using ((select private.is_conversation_member(id)));

create policy conversation_members_select_members
  on public.conversation_members
  for select
  to authenticated
  using ((select private.is_conversation_member(conversation_id)));

create policy messages_select_members
  on public.messages
  for select
  to authenticated
  using ((select private.is_conversation_member(conversation_id)));

create policy messages_insert_members
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
  );

-- Idempotent direct-chat creation: serialize requests for the same user pair,
-- reuse an existing two-member direct conversation, otherwise create both
-- memberships atomically. No client table INSERT privilege is needed.
create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  direct_conversation_id uuid;
  pair_lock_key text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'A different target user is required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target_user_id) then
    raise exception 'Target user was not found' using errcode = 'P0002';
  end if;

  pair_lock_key := least(actor_id::text, target_user_id::text)
    || ':' || greatest(actor_id::text, target_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(pair_lock_key, 0));

  select c.id
    into direct_conversation_id
  from public.conversations c
  where c.type = 'direct'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = actor_id
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = target_user_id
    )
    and (
      select count(*)
      from public.conversation_members cm
      where cm.conversation_id = c.id
    ) = 2
  order by c.created_at desc
  limit 1;

  if direct_conversation_id is null then
    insert into public.conversations (type)
    values ('direct')
    returning id into direct_conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values
      (direct_conversation_id, actor_id),
      (direct_conversation_id, target_user_id);
  end if;

  return direct_conversation_id;
end;
$$;

revoke all on function public.create_direct_conversation(uuid) from public, anon, authenticated;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
