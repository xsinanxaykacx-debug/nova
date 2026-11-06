-- Persist per-user read position so unread counts stay correct across browsers and devices.
alter table public.conversation_members
  add column if not exists last_read_at timestamptz not null default now();

update public.conversation_members cm
set last_read_at = coalesce(
  (select max(m.created_at) from public.messages m where m.conversation_id = cm.conversation_id),
  cm.joined_at
)
where cm.last_read_at is null;

grant update (last_read_at) on table public.conversation_members to authenticated;

create index if not exists conversation_members_last_read_idx
  on public.conversation_members (user_id, last_read_at desc);
