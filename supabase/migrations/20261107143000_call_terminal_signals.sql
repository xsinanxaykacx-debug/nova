-- Persist terminal call signals so users who have not joined the private
-- per-call broadcast topic still receive cancellations and rejections.
alter table public.call_signals
  drop constraint if exists call_signals_signal_type_check;

alter table public.call_signals
  add constraint call_signals_signal_type_check
  check (signal_type in ('offer', 'answer', 'ice', 'hangup', 'reject'));
