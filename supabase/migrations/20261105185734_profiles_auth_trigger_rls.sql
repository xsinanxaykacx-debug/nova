-- NOVA MVP-02: public user profiles, automatic profile creation, and profile RLS.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);
create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));
alter table public.profiles enable row level security;
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url, updated_at) on public.profiles to authenticated;
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare base_username text; generated_username text;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1), 'nova'), '[^a-zA-Z0-9_]', '', 'g'));
  base_username := left(base_username, 24);
  if length(base_username) < 3 then base_username := 'nova'; end if;
  generated_username := base_username;
  if exists (select 1 from public.profiles p where lower(p.username) = generated_username) then
    generated_username := left(base_username, 15) || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, generated_username,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'NOVA user'),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_profile_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute procedure public.set_profile_updated_at();
