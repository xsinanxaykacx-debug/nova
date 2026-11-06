-- MVP-07: distinguish encrypted text, audio, and file payloads.
-- Media metadata and bytes remain inside the E2EE ciphertext envelope.
alter table public.messages
  add column if not exists type text not null default 'text';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_type_allowed'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_type_allowed
      check (type in ('text', 'audio', 'file'));
  end if;
end;
$$;
