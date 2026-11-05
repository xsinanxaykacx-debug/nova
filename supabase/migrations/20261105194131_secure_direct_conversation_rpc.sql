-- Keep the privileged direct-conversation operation outside the exposed API schema.
-- The public RPC is an invoker-only bridge for authenticated clients.

create or replace function private.create_direct_conversation(target_user_id uuid)
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

revoke all on function private.create_direct_conversation(uuid) from public, anon, authenticated;
grant execute on function private.create_direct_conversation(uuid) to authenticated;

create or replace function public.create_direct_conversation(target_user_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_direct_conversation(target_user_id);
$$;

revoke all on function public.create_direct_conversation(uuid) from public, anon, authenticated;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

create index if not exists messages_sender_id_idx
  on public.messages (sender_id);
