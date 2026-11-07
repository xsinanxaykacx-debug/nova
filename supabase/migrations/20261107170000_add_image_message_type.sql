-- Camera captures are stored only as encrypted NOVA1 message envelopes.
alter table public.messages
  drop constraint if exists messages_type_allowed;

alter table public.messages
  add constraint messages_type_allowed
  check (type in ('text', 'audio', 'file', 'image'));
