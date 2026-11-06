-- MVP-08: group metadata, membership roles and per-member E2EE group-key envelopes.
-- The raw group key is never stored in the database.

alter table public.conversations
  add column if not exists name text,
  add column if not exists avatar_url text;

alter table public.conversation_members
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_members_role_allowed'
      and conrelid = 'public.conversation_members'::regclass
  ) then
    alter table public.conversation_members
      add constraint conversation_members_role_allowed
      check (role in ('admin', 'member'));
  end if;
end;
$$;

create table if not exists public.conversation_keys (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key_sender_id uuid not null references auth.users(id),
  encrypted_group_key text not null check (encrypted_group_key ~ '^NOVA1:'),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_keys_user_conversation_idx
  on public.conversation_keys (user_id, conversation_id);

alter table public.conversation_keys enable row level security;
revoke all on table public.conversation_keys from anon, authenticated;
grant select on table public.conversation_keys to authenticated;

create policy conversation_keys_select_own_member
  on public.conversation_keys
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
  );

create or replace function private.create_group_conversation(
  p_conversation_id uuid,
  p_name text,
  p_avatar_url text,
  p_member_ids uuid[],
  p_encrypted_keys jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  member_count integer;
  key_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_conversation_id is null
    or length(btrim(coalesce(p_name, ''))) not between 1 and 80
    or p_member_ids is null
    or cardinality(p_member_ids) < 3
    or cardinality(p_member_ids) > 100
    or not (actor_id = any(p_member_ids))
    or p_encrypted_keys is null
    or jsonb_typeof(p_encrypted_keys) <> 'array'
  then
    raise exception 'Invalid group details' using errcode = '22023';
  end if;

  select count(distinct requested.user_id) into member_count
  from unnest(p_member_ids) as requested(user_id);

  select count(*) into key_count
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  if member_count <> cardinality(p_member_ids)
    or key_count <> member_count
    or exists (
      select 1
      from unnest(p_member_ids) as requested(user_id)
      where not exists (
        select 1 from public.profiles p
        where p.id = requested.user_id and p.public_key is not null
      )
    )
    or exists (
      select 1
      from jsonb_array_elements(p_encrypted_keys) as entries(item)
      where entries.item->>'user_id' is null
        or entries.item->>'user_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or entries.item->>'encrypted_group_key' !~ '^NOVA1:'
        or entries.item->>'user_id' <> all (
          select requested.user_id::text from unnest(p_member_ids) as requested(user_id)
        )
    )
    or exists (
      select 1
      from unnest(p_member_ids) as requested(user_id)
      where not exists (
        select 1
        from jsonb_array_elements(p_encrypted_keys) as entries(item)
        where entries.item->>'user_id' = requested.user_id::text
      )
    )
  then
    raise exception 'Group members or encrypted keys are incomplete' using errcode = '22023';
  end if;

  insert into public.conversations (id, type, name, avatar_url)
  values (p_conversation_id, 'group', btrim(p_name), nullif(btrim(coalesce(p_avatar_url, '')), ''));

  insert into public.conversation_members (conversation_id, user_id, role)
  select p_conversation_id, requested.user_id,
    case when requested.user_id = actor_id then 'admin' else 'member' end
  from unnest(p_member_ids) as requested(user_id);

  insert into public.conversation_keys (conversation_id, user_id, key_sender_id, encrypted_group_key)
  select p_conversation_id, (entries.item->>'user_id')::uuid, actor_id, entries.item->>'encrypted_group_key'
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  return p_conversation_id;
end;
$$;

revoke all on function private.create_group_conversation(uuid, text, text, uuid[], jsonb) from public, anon, authenticated;
grant execute on function private.create_group_conversation(uuid, text, text, uuid[], jsonb) to authenticated;

create or replace function public.create_group_conversation(
  p_conversation_id uuid,
  p_name text,
  p_avatar_url text,
  p_member_ids uuid[],
  p_encrypted_keys jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_group_conversation(
    p_conversation_id, p_name, p_avatar_url, p_member_ids, p_encrypted_keys
  );
$$;

revoke all on function public.create_group_conversation(uuid, text, text, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.create_group_conversation(uuid, text, text, uuid[], jsonb) to authenticated;
