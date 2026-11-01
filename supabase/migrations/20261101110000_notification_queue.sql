-- Migration 19: email delivery for notifications through Supabase Queues (pgmq).
-- Every notification row is enqueued on `notification_email`. The Go engine worker reads a batch with a
-- visibility timeout, emails each one (Resend) and deletes the message; if sending fails the message becomes
-- visible again after the timeout and is retried, and after 6 attempts it is archived (pgmq.a_notification_email)
-- so nothing is lost silently. The in-app notification itself is written as before.

create extension if not exists pgmq;
select pgmq.create('notification_email')
where not exists (select 1 from pgmq.list_queues() where queue_name = 'notification_email');

alter table profiles add column if not exists notify_email boolean not null default true;

create or replace function notifications_enqueue_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pgmq.send('notification_email', jsonb_build_object('notification_id', new.id));
  return null;
exception when others then
  -- Delivery is best effort; never block the notification itself.
  raise warning 'notification_email enqueue failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function notifications_enqueue_email() from public, anon, authenticated;
drop trigger if exists notifications_enqueue_email on notifications;
create trigger notifications_enqueue_email after insert on notifications for each row execute function notifications_enqueue_email();

-- Worker API (service role only). Read hides each message for `vt` seconds; the rows carry what the email needs.
create or replace function notification_queue_read(qty int default 20, vt int default 300)
returns table (msg_id bigint, read_ct int, notification_id bigint, email text, lang text, title_en text, title_as text,
               complaint_id uuid, already_read boolean, wants_email boolean)
language sql security definer set search_path = public, pgmq as $$
  select m.msg_id, m.read_ct, n.id, u.email::text, coalesce(p.lang_pref, 'en'), n.title_en, n.title_as,
         n.complaint_id, coalesce(n.read, false), coalesce(p.notify_email, true) and coalesce(p.active, true)
  from pgmq.read('notification_email', vt, least(greatest(qty, 1), 100)) m
  left join notifications n on n.id = (m.message ->> 'notification_id')::bigint
  left join profiles p on p.id = n.user_id
  left join auth.users u on u.id = n.user_id
$$;

create or replace function notification_queue_ack(ids bigint[]) returns int
language sql security definer set search_path = public, pgmq as $$
  select count(*)::int from unnest(ids) i where pgmq.delete('notification_email', i)
$$;

create or replace function notification_queue_dead(ids bigint[]) returns int
language sql security definer set search_path = public, pgmq as $$
  select count(*)::int from unnest(ids) i where pgmq.archive('notification_email', i)
$$;

create or replace function notification_queue_stats() returns jsonb
language sql security definer set search_path = public, pgmq as $$
  select jsonb_build_object(
    'queued', (select count(*) from pgmq.q_notification_email),
    'retrying', (select count(*) from pgmq.q_notification_email where read_ct > 0),
    'dead', (select count(*) from pgmq.a_notification_email))
$$;

revoke execute on function notification_queue_read(int, int) from public, anon, authenticated;
revoke execute on function notification_queue_ack(bigint[]) from public, anon, authenticated;
revoke execute on function notification_queue_dead(bigint[]) from public, anon, authenticated;
revoke execute on function notification_queue_stats() from public, anon, authenticated;
grant execute on function notification_queue_read(int, int), notification_queue_ack(bigint[]),
  notification_queue_dead(bigint[]), notification_queue_stats() to service_role;
