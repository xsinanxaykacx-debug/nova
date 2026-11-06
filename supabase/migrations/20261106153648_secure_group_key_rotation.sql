-- Secure group membership changes with forward-only E2EE key rotation.
-- Each membership change creates a new epoch. New members receive only the new epoch;
-- historical envelopes remain bound to the members who were active in that epoch.

alter table public.conversations
  add column if not exists group_key_version integer not null default 1,
  add column if not exists group_key_rotation_required boolean not null default false;

alter table public.messages
  add column if not exists group_key_version integer;

update public.messages m
set group_key_version = 1
from public.conversations c
where c.id = m.conversation_id
  and c.type = 'group'
  and m.group_key_version is null;

update public.messages m
set group_key_version = null
from public.conversations c
where c.id = m.conversation_id
  and c.type = 'direct';

create table if not exists public.conversation_key_epochs (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  key_version integer not null check (key_version > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_sender_id uuid not null references auth.users(id),
  encrypted_group_key text not null check (encrypted_group_key ~ '^NOVA1:'),
  created_at timestamptz not null default now(),
  primary key (conversation_id, key_version, user_id)
);

insert into public.conversation_key_epochs
  (conversation_id, key_version, user_id, key_sender_id, encrypted_group_key, created_at)
select ck.conversation_id, 1, ck.user_id, ck.key_sender_id, ck.encrypted_group_key, ck.created_at
from public.conversation_keys ck
join public.conversations c on c.id = ck.conversation_id and c.type = 'group'
on conflict (conversation_id, key_version, user_id) do nothing;

alter table public.conversation_key_epochs enable row level security;
revoke all on table public.conversation_key_epochs from anon, authenticated;
grant select on table public.conversation_key_epochs to authenticated;

drop policy if exists conversation_key_epochs_select_own_member on public.conversation_key_epochs;
create policy conversation_key_epochs_select_own_member
  on public.conversation_key_epochs
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
  );

create index if not exists conversation_key_epochs_user_lookup_idx
  on public.conversation_key_epochs (user_id, conversation_id, key_version);

-- Membership and key-version changes are broadcast so active clients can refresh safely.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_members;

-- New group creation now writes epoch 1 as well as the legacy compatibility row.
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
    or length(btrim(coalesce(p_name, ''))) not between 2 and 80
    or p_member_ids is null
    or cardinality(p_member_ids) < 2
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

  insert into public.conversations (id, type, name, avatar_url, group_key_version)
  values (p_conversation_id, 'group', btrim(p_name), nullif(btrim(coalesce(p_avatar_url, '')), ''), 1);

  insert into public.conversation_members (conversation_id, user_id, role)
  select p_conversation_id, requested.user_id,
    case when requested.user_id = actor_id then 'admin' else 'member' end
  from unnest(p_member_ids) as requested(user_id);

  insert into public.conversation_keys (conversation_id, user_id, key_sender_id, encrypted_group_key)
  select p_conversation_id, (entries.item->>'user_id')::uuid, actor_id, entries.item->>'encrypted_group_key'
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  insert into public.conversation_key_epochs
    (conversation_id, key_version, user_id, key_sender_id, encrypted_group_key)
  select p_conversation_id, 1, (entries.item->>'user_id')::uuid, actor_id, entries.item->>'encrypted_group_key'
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

-- Rotate the group key in the same transaction as the membership change.
create or replace function private.rotate_group_membership(
  p_conversation_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_new_version integer,
  p_encrypted_keys jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_version integer;
  expected_count integer;
  supplied_count integer;
  unique_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('add', 'remove') or p_target_user_id is null
    or p_target_user_id = actor_id or p_new_version is null
    or p_encrypted_keys is null or jsonb_typeof(p_encrypted_keys) <> 'array'
  then
    raise exception 'Invalid membership change' using errcode = '22023';
  end if;

  select c.group_key_version into current_version
  from public.conversations c
  where c.id = p_conversation_id and c.type = 'group'
  for update;
  if current_version is null then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;
  if p_new_version <> current_version + 1 then
    raise exception 'Group key version conflict; refresh and retry' using errcode = '40001';
  end if;
  if exists (select 1 from public.conversations c where c.id = p_conversation_id and c.group_key_rotation_required) then
    raise exception 'A pending group-key rotation must finish before another membership change' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = actor_id and cm.role = 'admin' and cm.left_at is null
  ) then
    raise exception 'Only an active group admin can change membership' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = actor_id and p.public_key is not null) then
    raise exception 'Admin public key is not published' using errcode = '22023';
  end if;

  if p_action = 'add' then
    if not exists (select 1 from public.profiles p where p.id = p_target_user_id and p.public_key is not null) then
      raise exception 'Target user has no published E2EE public key' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.user_id = p_target_user_id
    ) then
      raise exception 'This user already belongs to or previously left this group' using errcode = '23505';
    end if;
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_conversation_id, p_target_user_id, 'member');
  else
    if not exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = p_target_user_id and cm.role = 'member' and cm.left_at is null
    ) then
      raise exception 'Only an active non-admin member can be removed' using errcode = '22023';
    end if;
    update public.conversation_members
    set left_at = now()
    where conversation_id = p_conversation_id and user_id = p_target_user_id and left_at is null;
  end if;

  select count(*) into expected_count
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.left_at is null;
  if expected_count > 100 then
    raise exception 'A group can contain at most 100 active members' using errcode = '22023';
  end if;

  select count(*), count(distinct entries.item->>'user_id')
    into supplied_count, unique_count
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  if supplied_count <> expected_count or unique_count <> expected_count
    or exists (
      select 1
      from jsonb_array_elements(p_encrypted_keys) as entries(item)
      where entries.item->>'user_id' is null
        or entries.item->>'user_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or entries.item->>'encrypted_group_key' !~ '^NOVA1:'
        or not exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = p_conversation_id
            and cm.user_id::text = entries.item->>'user_id'
            and cm.left_at is null
        )
    )
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.left_at is null
        and not exists (
          select 1 from jsonb_array_elements(p_encrypted_keys) as entries(item)
          where entries.item->>'user_id' = cm.user_id::text
        )
    )
  then
    raise exception 'New epoch must contain exactly one encrypted key for every active member' using errcode = '22023';
  end if;

  insert into public.conversation_key_epochs
    (conversation_id, key_version, user_id, key_sender_id, encrypted_group_key)
  select p_conversation_id, p_new_version, (entries.item->>'user_id')::uuid,
    actor_id, entries.item->>'encrypted_group_key'
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  update public.conversations
  set group_key_version = p_new_version, updated_at = now()
  where id = p_conversation_id;

  return p_new_version;
end;
$$;

revoke all on function private.rotate_group_membership(uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function private.rotate_group_membership(uuid, text, uuid, integer, jsonb) to authenticated;

create or replace function public.rotate_group_membership(
  p_conversation_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_new_version integer,
  p_encrypted_keys jsonb
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.rotate_group_membership(
    p_conversation_id, p_action, p_target_user_id, p_new_version, p_encrypted_keys
  );
$$;

revoke all on function public.rotate_group_membership(uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.rotate_group_membership(uuid, text, uuid, integer, jsonb) to authenticated;

-- A departing member cannot create the replacement key: doing so would let them retain it.
-- Instead, freeze group sends and let the remaining admin generate the next epoch.
create or replace function private.leave_group_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  successor_id uuid;
  remaining_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1 from public.conversations c
  where c.id = p_conversation_id and c.type = 'group'
  for update;
  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  select cm.role into actor_role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = actor_id and cm.left_at is null
  for update;
  if actor_role is null then
    raise exception 'Active group membership not found' using errcode = 'P0002';
  end if;

  if actor_role = 'admin' then
    select cm.user_id into successor_id
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id <> actor_id and cm.left_at is null
    order by cm.joined_at asc, cm.user_id asc
    limit 1
    for update;
    if successor_id is not null then
      update public.conversation_members set role = 'admin'
      where conversation_id = p_conversation_id and user_id = successor_id and left_at is null;
    end if;
  end if;

  update public.conversation_members
  set left_at = now()
  where conversation_id = p_conversation_id and user_id = actor_id and left_at is null;

  select count(*) into remaining_count
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.left_at is null;

  update public.conversations
  set group_key_rotation_required = (remaining_count > 0), updated_at = now()
  where id = p_conversation_id;
end;
$$;

revoke all on function private.leave_group_conversation(uuid) from public, anon, authenticated;
grant execute on function private.leave_group_conversation(uuid) to authenticated;

create or replace function public.leave_group_conversation(p_conversation_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.leave_group_conversation(p_conversation_id);
$$;

revoke all on function public.leave_group_conversation(uuid) from public, anon, authenticated;
grant execute on function public.leave_group_conversation(uuid) to authenticated;

-- Only a remaining active admin can create the replacement epoch after a departure.
create or replace function private.rotate_group_key(
  p_conversation_id uuid,
  p_new_version integer,
  p_encrypted_keys jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_version integer;
  expected_count integer;
  supplied_count integer;
  unique_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_encrypted_keys is null or jsonb_typeof(p_encrypted_keys) <> 'array' then
    raise exception 'Encrypted group keys are required' using errcode = '22023';
  end if;

  select c.group_key_version into current_version
  from public.conversations c
  where c.id = p_conversation_id and c.type = 'group' and c.group_key_rotation_required
  for update;
  if current_version is null then
    raise exception 'Group does not require key rotation' using errcode = '22023';
  end if;
  if p_new_version <> current_version + 1 then
    raise exception 'Group key version conflict; refresh and retry' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = actor_id and cm.role = 'admin' and cm.left_at is null
  ) then
    raise exception 'Only the remaining active admin can rotate the group key' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = actor_id and p.public_key is not null) then
    raise exception 'Admin public key is not published' using errcode = '22023';
  end if;

  select count(*) into expected_count
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.left_at is null;
  select count(*), count(distinct entries.item->>'user_id')
    into supplied_count, unique_count
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  if supplied_count <> expected_count or unique_count <> expected_count
    or exists (
      select 1 from jsonb_array_elements(p_encrypted_keys) as entries(item)
      where entries.item->>'user_id' is null
        or entries.item->>'user_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or entries.item->>'encrypted_group_key' !~ '^NOVA1:'
        or not exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = p_conversation_id
            and cm.user_id::text = entries.item->>'user_id'
            and cm.left_at is null
        )
    )
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.left_at is null
        and not exists (
          select 1 from jsonb_array_elements(p_encrypted_keys) as entries(item)
          where entries.item->>'user_id' = cm.user_id::text
        )
    )
  then
    raise exception 'New epoch must contain exactly one encrypted key for every remaining member' using errcode = '22023';
  end if;

  insert into public.conversation_key_epochs
    (conversation_id, key_version, user_id, key_sender_id, encrypted_group_key)
  select p_conversation_id, p_new_version, (entries.item->>'user_id')::uuid,
    actor_id, entries.item->>'encrypted_group_key'
  from jsonb_array_elements(p_encrypted_keys) as entries(item);

  update public.conversations
  set group_key_version = p_new_version, group_key_rotation_required = false, updated_at = now()
  where id = p_conversation_id;

  return p_new_version;
end;
$$;

revoke all on function private.rotate_group_key(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function private.rotate_group_key(uuid, integer, jsonb) to authenticated;

create or replace function public.rotate_group_key(
  p_conversation_id uuid,
  p_new_version integer,
  p_encrypted_keys jsonb
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.rotate_group_key(p_conversation_id, p_new_version, p_encrypted_keys);
$$;

revoke all on function public.rotate_group_key(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.rotate_group_key(uuid, integer, jsonb) to authenticated;

-- Membership departure must go through the function so admin succession is atomic.
revoke update (left_at) on table public.conversation_members from authenticated;

-- A group message must always use the current epoch; direct messages have no epoch.
drop policy if exists messages_insert_members on public.messages;
create policy messages_insert_members
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_conversation_member(conversation_id))
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (c.type = 'direct' and messages.group_key_version is null)
          or
          (c.type = 'group' and not c.group_key_rotation_required
            and messages.group_key_version = c.group_key_version)
        )
    )
  );
