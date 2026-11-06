-- Add indexes for foreign keys used by membership and key-envelope lookups.
create index if not exists conversation_keys_key_sender_id_idx
  on public.conversation_keys (key_sender_id);

create index if not exists message_user_state_user_id_idx
  on public.message_user_state (user_id);

-- The two previous UPDATE policies had identical USING clauses and complementary
-- WITH CHECK clauses. A single policy preserves the same allowed state changes.
drop policy if exists conversation_members_leave_own
  on public.conversation_members;
drop policy if exists conversation_members_update_own_state
  on public.conversation_members;

create policy conversation_members_update_own_state
  on public.conversation_members
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and left_at is null
    and (select private.is_conversation_member(conversation_id))
  )
  with check (user_id = (select auth.uid()));
