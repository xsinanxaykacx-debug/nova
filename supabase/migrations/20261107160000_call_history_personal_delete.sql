-- Keep each participant's call-history visibility independent.
alter table public.call_history
  add column if not exists caller_deleted_at timestamptz,
  add column if not exists callee_deleted_at timestamptz;

-- The existing participant UPDATE policy controls which row can be touched.
-- This trigger additionally prevents either participant from hiding the
-- other participant's copy of the shared call record.
create or replace function public.guard_call_history_personal_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.caller_deleted_at is distinct from old.caller_deleted_at
     and (select auth.uid()) is distinct from old.caller_id then
    raise exception 'You can only hide your own call history entry'
      using errcode = '42501';
  end if;

  if new.callee_deleted_at is distinct from old.callee_deleted_at
     and (select auth.uid()) is distinct from old.callee_id then
    raise exception 'You can only hide your own call history entry'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists call_history_personal_deletion_guard on public.call_history;
create trigger call_history_personal_deletion_guard
before update of caller_deleted_at, callee_deleted_at
on public.call_history
for each row
execute function public.guard_call_history_personal_deletion();

-- Replace broad default table-level UPDATE privileges with the exact
-- columns used by the call lifecycle and participant-specific soft-delete.
revoke update on table public.call_history from anon, authenticated;
revoke update (status, ended_at, caller_deleted_at, callee_deleted_at)
on table public.call_history from anon, authenticated;
grant update (status, ended_at, caller_deleted_at, callee_deleted_at)
on table public.call_history to authenticated;

-- Hard deletion bypasses the participant-specific visibility model.
-- TRUNCATE also bypasses row-level security, so neither role may use it.
revoke delete, truncate on table public.call_history from anon, authenticated;
