-- Migration 13: anonymous reporters are no longer stored on the complaint row.
-- complaints.user_id is NULL for anonymous reports; the reporter lives in complaint_owners, readable only by
-- that reporter. Events and messages keep a by_reporter / from_reporter flag instead of the reporter's id, so
-- "this came from the reporter" survives without revealing who. Everything that needs the reporter internally
-- (notifications, owner permissions, rate limit) goes through complaint_reporter(), which is not callable
-- through the API.

-- ---------- owner table ----------
create table if not exists complaint_owners (
  complaint_id uuid primary key references complaints on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists complaint_owners_user on complaint_owners (user_id);
alter table complaint_owners enable row level security;
drop policy if exists "owners read own" on complaint_owners;
create policy "owners read own" on complaint_owners for select using (user_id = auth.uid());

-- Internal: the reporter of a complaint whether or not it is anonymous. Never granted to API roles.
create or replace function complaint_reporter(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(c.user_id, o.user_id) from complaints c left join complaint_owners o on o.complaint_id = c.id where c.id = cid
$$;
revoke execute on function complaint_reporter(uuid) from public, anon, authenticated;

-- Safe to expose: only answers "is this my anonymous report?" for the caller.
create or replace function is_my_complaint(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from complaint_owners o where o.complaint_id = cid and o.user_id = auth.uid())
$$;
revoke execute on function is_my_complaint(uuid) from public, anon;
grant execute on function is_my_complaint(uuid) to authenticated;

-- ---------- events: by_reporter flag, actor hidden on anonymous reports ----------
alter table complaint_events add column if not exists by_reporter boolean not null default false;

create or replace function complaint_events_mask_anonymous() returns trigger
language plpgsql security definer set search_path = public as $$
declare rep uuid; anon boolean;
begin
  select complaint_reporter(new.complaint_id), c.anonymous into rep, anon from complaints c where c.id = new.complaint_id;
  if new.type = 'created' or (new.actor_id is not null and new.actor_id = rep) then
    new.by_reporter := true;
  end if;
  if anon and new.by_reporter then
    new.actor_id := null;
  end if;
  return new;
end $$;
-- (trigger complaint_events_mask_anonymous from migration 11 keeps calling this function)

-- ---------- messages: from_reporter flag, sender hidden on anonymous reports ----------
alter table messages add column if not exists from_reporter boolean not null default false;

create or replace function messages_mark_reporter() returns trigger
language plpgsql security definer set search_path = public as $$
declare rep uuid; anon boolean;
begin
  select complaint_reporter(new.complaint_id), c.anonymous into rep, anon from complaints c where c.id = new.complaint_id;
  if new.sender_id is not null and new.sender_id = rep then
    new.from_reporter := true;
    if anon then new.sender_id := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists messages_mark_reporter on messages;
create trigger messages_mark_reporter before insert on messages for each row execute function messages_mark_reporter();
revoke execute on function messages_mark_reporter() from public, anon, authenticated;

-- RLS checks the row after BEFORE triggers, so an anonymous reporter's message (sender_id nulled) needs its own branch.
drop policy if exists "messages send" on messages;
create policy "messages send" on messages for insert with check (
  (sender_id = auth.uid() or (sender_id is null and from_reporter and is_my_complaint(complaint_id)))
  and exists (select 1 from complaints c where c.id = complaint_id)
);

-- ---------- complaints: move the reporter of new anonymous reports ----------
-- Runs after complaints_aw (alphabetical), so the "created" event is already written and flagged.
create or replace function complaints_move_anonymous_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into complaint_owners (complaint_id, user_id) values (new.id, new.user_id) on conflict (complaint_id) do nothing;
  update complaints set user_id = null where id = new.id;
  return null;
end $$;
drop trigger if exists complaints_zz_anonymous_owner on complaints;
create trigger complaints_zz_anonymous_owner after insert on complaints
  for each row when (new.anonymous and new.user_id is not null)
  execute function complaints_move_anonymous_owner();
revoke execute on function complaints_move_anonymous_owner() from public, anon, authenticated;

-- Owner rules: own row by user_id, or an anonymous report the caller owns.
drop policy if exists "complaints owner read" on complaints;
create policy "complaints owner read" on complaints for select using (user_id = auth.uid() or is_my_complaint(id));
drop policy if exists "complaints owner rate" on complaints;
create policy "complaints owner rate" on complaints for update
  using (user_id = auth.uid() or is_my_complaint(id)) with check (user_id = auth.uid() or is_my_complaint(id));

-- Idempotency key no longer depends on user_id (NULL for anonymous rows); keys are random UUIDs.
drop index if exists complaints_client_request;
create unique index if not exists complaints_client_request on complaints (client_request_id) where client_request_id is not null;

-- ---------- functions that read the reporter ----------
create or replace function complaints_column_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  uid uuid := auth.uid();
  is_mgr boolean;
  is_owner boolean;
  is_assignee boolean;
  allowed text[] := array['updated_at'];
  last_closed timestamptz;
  status_ok boolean := false;
begin
  if uid is null or current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  is_mgr := current_role_is('super_admin')
    or (current_role_is('dept_admin') and old.department_id is not distinct from my_department() and old.department_id is not null);
  if is_mgr then
    return new;
  end if;
  is_owner := old.user_id = uid or is_my_complaint(old.id);
  is_assignee := old.assignee_id = uid;
  if not is_owner and not is_assignee then
    raise exception 'FORBIDDEN_COLUMNS' using errcode = '42501';
  end if;
  if is_owner then
    allowed := allowed || array['status', 'rating', 'verified_by_reporter'];
  end if;
  if is_assignee then
    allowed := allowed || array['status', 'resolution_note_en', 'resolution_note_as', 'resolution_photo_url'];
  end if;
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'FORBIDDEN_COLUMNS' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if is_owner then
      if old.status = 'resolved' and new.status in ('closed', 'in_progress') then
        status_ok := true;
      elsif old.status = 'closed' and new.status = 'in_progress' then
        select max(created_at) into last_closed
        from complaint_events where complaint_id = old.id and to_status = 'closed';
        status_ok := coalesce(last_closed, old.updated_at) > now() - interval '7 days';
      end if;
    end if;
    if is_assignee and new.status in ('in_progress', 'resolved') then
      status_ok := true;
    end if;
    if not status_ok then
      raise exception 'FORBIDDEN_STATUS %->%', old.status, new.status using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function complaints_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_en text; s_as text; uid uuid := auth.uid(); t_en text; t_as text; rep uuid;
begin
  if tg_op = 'INSERT' then
    insert into complaint_events (complaint_id, actor_id, type, to_status) values (new.id, new.user_id, 'created', new.status);
  elsif new.status is distinct from old.status then
    rep := complaint_reporter(new.id);
    insert into complaint_events (complaint_id, actor_id, type, from_status, to_status) values (new.id, uid, 'status', old.status, new.status);
    s_en := initcap(replace(new.status::text, '_', ' '));
    s_as := case new.status
      when 'triaged' then 'পৰীক্ষা কৰা হ''ল' when 'assigned' then 'দায়িত্ব দিয়া হ''ল' when 'in_progress' then 'কাম চলি আছে'
      when 'resolved' then 'সমাধান হ''ল' when 'closed' then 'বন্ধ' when 'duplicate' then 'একে অভিযোগৰ সৈতে যোগ কৰা হ''ল'
      when 'rejected' then 'নাকচ' when 'needs_review' then 'পুনৰীক্ষণ প্ৰয়োজন' else 'আপডেট হ''ল' end;
    if rep is not null and uid is distinct from rep then
      insert into notifications (user_id, complaint_id, title_en, title_as)
      values (rep, new.id, new.code || ': ' || s_en, new.code || ': ' || s_as);
    end if;
    if uid is not null and uid = rep and new.status = 'in_progress' and old.status in ('resolved', 'closed') then
      if old.status = 'resolved' then
        t_en := new.code || ': Reporter says it is not fixed';
        t_as := new.code || ': অভিযোগকাৰীয়ে সমস্যাটো সমাধান হোৱা নাই বুলি জনাইছে';
      else
        t_en := new.code || ': Reopened by the reporter';
        t_as := new.code || ': অভিযোগকাৰীয়ে অভিযোগটো পুনৰ খুলিছে';
      end if;
      insert into notifications (user_id, complaint_id, title_en, title_as)
      select r.id, new.id, t_en, t_as
      from (
        select new.assignee_id as id where new.assignee_id is not null
        union
        select p.id from profiles p
        where p.role = 'dept_admin' and new.department_id is not null and p.department_id = new.department_id
      ) r
      where r.id is distinct from rep;
    end if;
  end if;
  return new;
end $$;

create or replace function public_complaint_events(cid uuid)
returns table (id bigint, type text, from_status complaint_status, to_status complaint_status, note_en text, note_as text, created_at timestamptz, actor_kind text)
language sql stable security definer set search_path = public as $$
  select e.id, e.type, e.from_status, e.to_status,
         case when e.by_reporter then null else e.note_en end,
         case when e.by_reporter then null else e.note_as end,
         e.created_at,
         case
           when e.actor_id is not null and e.actor_id = auth.uid() then 'me'
           when e.by_reporter then 'reporter'
           when e.actor_id is null then 'system'
           when e.type = 'metoo' then 'supporter'
           else 'staff'
         end
  from complaint_events e
  join complaints c on c.id = e.complaint_id
  where e.complaint_id = cid
    and auth.uid() is not null
    and c.visibility = 'public' and not c.is_sensitive and c.parent_id is null
  order by e.created_at, e.id
$$;

create or replace function check_rate_limit(max_per_hour int default 5) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) < max_per_hour from complaints c
  where (c.user_id = auth.uid() or exists (select 1 from complaint_owners o where o.complaint_id = c.id and o.user_id = auth.uid()))
    and c.created_at > now() - interval '1 hour'
$$;

-- ---------- backfill existing data (order matters: flag first, then move) ----------
update complaint_events e set by_reporter = true
  from complaints c where c.id = e.complaint_id and (e.type = 'created' or (e.actor_id is not null and e.actor_id = c.user_id));
update messages m set from_reporter = true
  from complaints c where c.id = m.complaint_id and m.sender_id is not null and m.sender_id = c.user_id;
insert into complaint_owners (complaint_id, user_id)
  select id, user_id from complaints where anonymous and user_id is not null
  on conflict (complaint_id) do nothing;
update complaint_events e set actor_id = null
  from complaints c where c.id = e.complaint_id and c.anonymous and e.by_reporter;
update messages m set sender_id = null
  from complaints c where c.id = m.complaint_id and c.anonymous and m.from_reporter;
update complaints set user_id = null where anonymous and user_id is not null;

-- Server code (service role) resolves the reporter after its own access check; API roles still cannot.
grant execute on function complaint_reporter(uuid) to service_role;
