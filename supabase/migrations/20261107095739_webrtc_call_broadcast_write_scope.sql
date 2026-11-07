drop policy if exists "Call participants can send private call broadcasts" on realtime.messages;

create policy "Call participants can send private call broadcasts"
  on realtime.messages for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.call_signals cs
      where cs.call_id::text = split_part((select realtime.topic()), ':', 2)
        and auth.uid() in (cs.sender_id, cs.receiver_id)
    )
  );
