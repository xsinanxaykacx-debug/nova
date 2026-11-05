-- NOVA MVP-05: publish only ECDH public keys. Private keys remain in browser IndexedDB.
alter table public.profiles
  add column if not exists public_key text;

alter table public.profiles
  drop constraint if exists profiles_public_key_format;

alter table public.profiles
  add constraint profiles_public_key_format
  check (public_key is null or public_key ~ '^[0-9a-f]{130}$');

grant update (public_key) on public.profiles to authenticated;
