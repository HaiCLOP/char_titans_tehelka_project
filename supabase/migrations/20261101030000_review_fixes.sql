-- Migration 11: fixes from the external code review (verified against the code).
--  1. Sensitive reports are admins-only: field staff can't be assigned, can't read, aren't suggested.
--  2. Dept admins read only the profiles they need (their department + reporters of their tickets).
--  3. Anonymous reporters: the "created" timeline event no longer carries the reporter's id.
--  4. Shared rate limits (Postgres, not per-process memory) for AI preview, agent and chat.
--  5. Idempotent complaint submission (client_request_id).
--  6. SLA alert worker: notifications + marker written atomically in one function.
--  7. Append-only audit log for privileged actions.

-- ---------- 1. sensitive reports ----------
-- Field staff may never be the assignee of a sensitive report (admins may).
create or replace function complaints_sensitive_assignee() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_sensitive and new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.is_sensitive is distinct from old.is_sensitive)
     and exists (select 1 from profiles p where p.id = new.assignee_id and p.role = 'field_staff') then
    raise exception 'SENSITIVE_ADMINS_ONLY' using errcode = '42501',
      hint = 'Sensitive reports can only be handled by department admins';
  end if;
  return new;
end $$;
drop trigger if exists complaints_sensitive_assignee on complaints;
create trigger complaints_sensitive_assignee before insert or update on complaints
  for each row execute function complaints_sensitive_assignee();
revoke execute on function complaints_sensitive_assignee() from public, anon, authenticated;

-- An assignee only sees the ticket while it is not sensitive (an admin assignee still sees it via the admin policies).
drop policy if exists "complaints assignee read" on complaints;
create policy "complaints assignee read" on complaints for select
  using (assignee_id = auth.uid() and not is_sensitive);
drop policy if exists "complaints assignee update" on complaints;
create policy "complaints assignee update" on complaints for update
  using (assignee_id = auth.uid() and not is_sensitive) with check (assignee_id = auth.uid());

-- Staff suggestions skip sensitive reports.
create or replace function rank_assignees(cid uuid)
returns table (id uuid, full_name text, score int, skill_match boolean, skill_required boolean,
               covers boolean, open_jobs int, last_assigned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  c_dept uuid; c_cat complaint_category; c_loc uuid;
  need_skill boolean;
begin
  select x.department_id, x.category, x.location_id into c_dept, c_cat, c_loc from complaints x where x.id = cid;
  if not found then
    return;
  end if;
  -- Sensitive reports are admins-only (PRD rule 4): never suggest field staff for them.
  if exists (select 1 from complaints x where x.id = cid and x.is_sensitive) then
    return;
  end if;
  if not (auth.role() = 'service_role'
          or current_role_is('super_admin')
          or (current_role_is('dept_admin') and c_dept is not null and c_dept = my_department())) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if c_dept is null then
    return;
  end if;

  select exists (
    select 1 from profiles p
    where p.department_id = c_dept and p.role = 'field_staff' and p.active and cardinality(p.skills) > 0
  ) into need_skill;

  return query
  with staff as (
    select p.id, p.full_name, p.last_assigned_at,
           c_cat = any (p.skills) as skill_match,
           (c_loc is null or cardinality(p.coverage_location_ids) = 0 or c_loc = any (p.coverage_location_ids)) as covers
    from profiles p
    where p.department_id = c_dept and p.role = 'field_staff' and p.active
  ), jobs as (
    select x.assignee_id, count(*)::int as n
    from complaints x
    where x.status in ('assigned', 'in_progress') and x.assignee_id in (select s.id from staff s)
    group by x.assignee_id
  )
  select s.id, s.full_name,
         ((case when s.skill_match then 40 when not need_skill then 20 else 0 end)
          + (case when s.covers then 30 else 0 end)
          + greatest(0, 30 - 10 * coalesce(j.n, 0)))::int,
         s.skill_match, need_skill, s.covers, coalesce(j.n, 0), s.last_assigned_at
  from staff s
  left join jobs j on j.assignee_id = s.id
  where not need_skill or s.skill_match
  order by s.covers desc, coalesce(j.n, 0) asc, s.last_assigned_at asc nulls first, s.id;
end $$;

-- ---------- 2. profile visibility ----------
-- Before: any dept_admin could read every profile (is_admin()). Now: self, super admin, or a dept admin for
-- members of their own department and the (non-anonymous) reporters / assignees of their department's tickets.
create or replace function dept_admin_can_read_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_is('dept_admin') and my_department() is not null and (
    exists (select 1 from profiles p where p.id = pid and p.department_id = my_department())
    or exists (select 1 from complaints c where c.department_id = my_department()
               and ((c.user_id = pid and not c.anonymous) or c.assignee_id = pid))
  )
$$;
revoke execute on function dept_admin_can_read_profile(uuid) from public, anon;
grant execute on function dept_admin_can_read_profile(uuid) to authenticated;

drop policy if exists "profiles self read" on profiles;
create policy "profiles self read" on profiles for select
  using (id = auth.uid() or current_role_is('super_admin') or dept_admin_can_read_profile(id));

-- ---------- 3. anonymous reporters ----------
create or replace function complaint_events_mask_anonymous() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'created' and exists (select 1 from complaints c where c.id = new.complaint_id and c.anonymous) then
    new.actor_id := null;
  end if;
  return new;
end $$;
drop trigger if exists complaint_events_mask_anonymous on complaint_events;
create trigger complaint_events_mask_anonymous before insert on complaint_events
  for each row execute function complaint_events_mask_anonymous();
revoke execute on function complaint_events_mask_anonymous() from public, anon, authenticated;
update complaint_events e set actor_id = null
  from complaints c where c.id = e.complaint_id and c.anonymous and e.type = 'created' and e.actor_id is not null;

-- ---------- 4. shared rate limits ----------
create table if not exists rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bucket text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_lookup on rate_events (user_id, bucket, at desc);
alter table rate_events enable row level security; -- no policies: only the function below touches it

-- Atomically counts the caller's events in the window and records one more if allowed.
-- Returns 0 when allowed, otherwise the seconds until the oldest event leaves the window.
create or replace function hit_rate_limit(p_bucket text, p_max int, p_window_seconds int) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  oldest timestamptz;
begin
  if uid is null then return p_window_seconds; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || p_bucket));
  select count(*), min(at) into n, oldest from rate_events
    where user_id = uid and bucket = p_bucket and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return greatest(1, ceil(extract(epoch from (oldest + make_interval(secs => p_window_seconds) - now())))::int);
  end if;
  insert into rate_events (user_id, bucket) values (uid, p_bucket);
  -- keep the table small
  delete from rate_events where user_id = uid and bucket = p_bucket and at < now() - interval '1 day';
  return 0;
end $$;
revoke execute on function hit_rate_limit(text, int, int) from public, anon;
grant execute on function hit_rate_limit(text, int, int) to authenticated;

-- ---------- 5. idempotent submission ----------
alter table complaints add column if not exists client_request_id uuid;
create unique index if not exists complaints_client_request
  on complaints (user_id, client_request_id) where client_request_id is not null;

-- ---------- 6. SLA alerts: one atomic step per complaint ----------
-- Claims the complaint (sla_alerted_at) and writes the dept-admin notifications in the same transaction,
-- so a crash can neither duplicate alerts nor lose the marker. Returns the number of notifications.
create or replace function sla_alert_complaint(cid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
begin
  update complaints set sla_alerted_at = now()
   where id = cid and sla_alerted_at is null and sla_due_at < now()
     and status not in ('resolved','closed','rejected','duplicate')
  returning id, code, department_id into c;
  if not found then return 0; end if;
  insert into notifications (user_id, complaint_id, title_en, title_as)
  select p.id, c.id, c.code || ' is overdue', c.code || ': সমাধানৰ সময়সীমা পাৰ হৈছে'
    from profiles p where p.role = 'dept_admin' and p.department_id = c.department_id and coalesce(p.active, true);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function sla_alert_complaint(uuid) from public, anon, authenticated;
grant execute on function sla_alert_complaint(uuid) to service_role;

-- ---------- 7. audit log ----------
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,          -- e.g. key.create, key.simulate_failure, model.update, member.role, department.update
  target text,                   -- e.g. ai_keys:<id>, profiles:<id>
  details jsonb not null default '{}', -- redacted: never secrets or complaint text
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_t on audit_logs (created_at desc);
alter table audit_logs enable row level security;
drop policy if exists "audit super admin read" on audit_logs;
create policy "audit super admin read" on audit_logs for select using (current_role_is('super_admin'));
-- Append-only: no update/delete for anyone through the API; inserts come from server code (service role).
revoke update, delete on audit_logs from anon, authenticated;
