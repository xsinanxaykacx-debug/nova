-- User-scoped chat hiding, sender-only message soft deletion, and group departure.
-- Ciphertext and conversation rows are retained; no shared history is hard-deleted.

alter table public.messages
  add column if not exists deleted_at timestamptz;

alter table public.conversation_members
  add column if not exists left_at timestamptz,
  add column if not exists hidden_at timestamptz;

-- A departed member is no longer considered an active participant by any
-- membership-based RLS policy or server-side membership check.
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
      and cm.left_at is null
  );
$$;

revoke all on function private.is_conversation_member(uuid) from public, anon, authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;

-- Only the sender can soft-delete their own message. Column-level grants mean
-- clients cannot alter ciphertext, sender_id, conversation_id, or timestamps.
grant update (deleted_at) on table public.messages to authenticated;

create policy messages_soft_delete_own
  on public.messages
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and deleted_at is null
    and (select private.is_conversation_member(conversation_id))
  )
  with check (
    sender_id = (select auth.uid())
    and deleted_at is not null
    and (select private.is_conversation_member(conversation_id))
  );

-- Per-user direct-chat hiding and group departure are stored on the user's
-- own membership row. A hidden direct chat remains an active membership.
grant update (left_at, hidden_at) on table public.conversation_members to authenticated;

create policy conversation_members_update_own_state
  on public.conversation_members
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and left_at is null
    and (select private.is_conversation_member(conversation_id))
  )
  with check (
    user_id = (select auth.uid())
    and left_at is null
  );

create policy conversation_members_leave_own
  on public.conversation_members
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and left_at is null
    and (select private.is_conversation_member(conversation_id))
  )
  with check (
    user_id = (select auth.uid())
    and left_at is not null
  );
