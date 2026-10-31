-- Migration 10: field staff skills + building coverage + active flag, profile column guard, and safe auto-assignment.
--
-- Matching rule ("skills + buildings + load"), implemented once in rank_assignees() and used by both the
-- workspace suggestions (dept admin / super admin) and auto_assign_complaint() (service role, submit pipeline):
--   candidates = active field_staff of the ticket's department
--   1. skill   : the ticket's category is in profiles.skills — REQUIRED when any active field staff of the
--                department has skills set; otherwise every candidate qualifies (department only)
--   2. covers  : the ticket's building is in profiles.coverage_location_ids (bonus). Empty list = covers all
--                buildings; a ticket without a building is covered by everyone.
--   3. load    : fewest open assigned tickets (assigned + in_progress)
--   4. fairness: longest time since last assignment (profiles.last_assigned_at, nulls first)

-- =====================================================================================================
-- 1. Columns
-- =====================================================================================================
alter table profiles
  add column if not exists skills complaint_category[] not null default '{}',
  add column if not exists coverage_location_ids uuid[] not null default '{}',
  add column if not exists active boolean not null default true,
  add column if not exists last_assigned_at timestamptz;
comment on column profiles.skills is 'Field staff: complaint categories this person can fix (set by super admin)';
comment on column profiles.coverage_location_ids is 'Field staff: buildings this person covers; empty = all buildings (set by super admin)';
comment on column profiles.active is 'false = not offered for assignment (set by super admin)';
comment on column profiles.last_assigned_at is 'Maintained by trigger when a complaint is assigned to this person';

create index if not exists profiles_dept_role on profiles (department_id, role);

-- =====================================================================================================
-- 2. Profile column guard
-- =====================================================================================================
-- RLS "profiles self update" already keeps role = my_role(). This trigger closes the rest for PostgREST
-- callers: only a super admin changes role, skills, coverage, active (and nobody but the DB touches
-- last_assigned_at). department_id: a `staff` member may set their own (onboarding); field staff, admins
-- and students may not. A super admin can never demote or deactivate themselves (no lock-out).
create or replace function profiles_guard() returns trigger
language plpgsql set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
     or new.last_assigned_at is distinct from old.last_assigned_at then
    raise exception 'FORBIDDEN_COLUMNS' using errcode = '42501';
  end if;
  if current_role_is('super_admin') then
    if old.id = uid and (new.role is distinct from old.role or not new.active) then
      raise exception 'FORBIDDEN_SELF_DEMOTE' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role
     or new.skills is distinct from old.skills
     or new.coverage_location_ids is distinct from old.coverage_location_ids
     or new.active is distinct from old.active
     or (new.department_id is distinct from old.department_id and old.role <> 'staff') then
    raise exception 'FORBIDDEN_COLUMNS' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard before update on profiles for each row execute function profiles_guard();

-- =====================================================================================================
-- 3. last_assigned_at bookkeeping
-- =====================================================================================================
create or replace function complaints_track_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    update profiles set last_assigned_at = now() where id = new.assignee_id;
  end if;
  return new;
end $$;
revoke execute on function complaints_track_assignment() from public, anon, authenticated;

drop trigger if exists complaints_track_assignment on complaints;
create trigger complaints_track_assignment after insert or update of assignee_id on complaints
  for each row execute function complaints_track_assignment();

-- =====================================================================================================
-- 4. Ranking
-- =====================================================================================================
-- Callable by the service role, a super admin, or a dept admin of the ticket's department. Returns only
-- candidates that pass the skill rule, best first.
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
revoke execute on function rank_assignees(uuid) from public, anon;
grant execute on function rank_assignees(uuid) to authenticated, service_role;

-- =====================================================================================================
-- 5. Auto-assignment (service role only)
-- =====================================================================================================
-- Assigns a freshly auto-routed ticket to the best candidate. Re-checks the PRD rule-1 safety conditions
-- itself (status triaged, AI source, confidence >= 0.75, not sensitive / sensitive-suggested, not urgent,
-- not abusive), so it is safe to call from any worker. Returns {id, name, note_en, note_as} or null.
-- The timeline note is visible to the reporter, so it carries no staff name (names are admin-only);
-- the name lives in ai_meta.assign_reason for the admin workspace.
create or replace function auto_assign_complaint(cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c complaints%rowtype;
  pick record;
  loc_en text; loc_as text;
  cat_en text; cat_as text;
  parts_en text[] := '{}'; parts_as text[] := '{}';
  n_en text; n_as text;
  digits text;
begin
  select * into c from complaints where id = cid for update;
  if not found
     or c.status <> 'triaged' or c.assignee_id is not null or c.department_id is null or c.parent_id is not null
     or c.is_sensitive or c.is_urgent or c.ai_status <> 'done'
     or coalesce((c.ai_meta ->> 'auto_routed')::boolean, false) is not true
     or coalesce((c.ai_meta ->> 'is_sensitive_suggested')::boolean, false)
     or coalesce((c.ai_meta ->> 'is_abusive')::boolean, false)
     or coalesce((c.ai_meta ->> 'confidence')::real, 0) < 0.75 then
    return null;
  end if;

  select * into pick from rank_assignees(cid) limit 1;
  if pick.id is null then
    return null;
  end if;

  cat_en := case c.category
    when 'water_supply' then 'Water supply' when 'plumbing' then 'Plumbing' when 'electrical' then 'Electrical'
    when 'sanitation' then 'Sanitation' when 'hostel' then 'Hostel' when 'mess_food' then 'Mess & food'
    when 'infrastructure' then 'Infrastructure' when 'it_network' then 'IT & Wi-Fi' when 'academic' then 'Academic'
    when 'safety_security' then 'Safety & security' when 'transport' then 'Transport' else 'Other' end;
  cat_as := case c.category
    when 'water_supply' then 'পানী যোগান' when 'plumbing' then 'পাইপ-নলী' when 'electrical' then 'বিদ্যুৎ'
    when 'sanitation' then 'চাফাই' when 'hostel' then 'হোষ্টেল' when 'mess_food' then 'মেছ আৰু খাদ্য'
    when 'infrastructure' then 'আন্তঃগাঁথনি' when 'it_network' then 'আইটি আৰু ৱাই-ফাই' when 'academic' then 'শৈক্ষিক'
    when 'safety_security' then 'সুৰক্ষা' when 'transport' then 'পৰিবহণ' else 'অন্যান্য' end;

  if pick.skill_match then
    parts_en := parts_en || cat_en;
    parts_as := parts_as || cat_as;
  end if;
  if c.location_id is not null and pick.covers then
    select l.name_en, l.name_as into loc_en, loc_as from locations l where l.id = c.location_id;
    if loc_en is not null then
      parts_en := parts_en || ('covers ' || loc_en);
      parts_as := parts_as || (loc_as || ' চোৱাচিতা কৰে');
    end if;
  end if;
  digits := translate(pick.open_jobs::text, '0123456789', '০১২৩৪৫৬৭৮৯');
  parts_en := parts_en || (pick.open_jobs || case when pick.open_jobs = 1 then ' open job' else ' open jobs' end);
  parts_as := parts_as || (digits || 'টা খোলা কাম');

  n_en := 'Auto-assigned: ' || array_to_string(parts_en, ' · ');
  n_as := 'স্বয়ংক্ৰিয়ভাৱে দায়িত্ব দিয়া হ''ল: ' || array_to_string(parts_as, ' · ');

  update complaints
  set assignee_id = pick.id,
      status = 'assigned',
      ai_meta = ai_meta || jsonb_build_object(
        'auto_assigned', true,
        'auto_assigned_to', pick.id,
        'auto_assigned_at', now(),
        'assign_reason', jsonb_build_object(
          'name', pick.full_name, 'score', pick.score,
          'skill', pick.skill_match, 'skill_required', pick.skill_required,
          'covers', pick.covers, 'open_jobs', pick.open_jobs,
          'note_en', n_en, 'note_as', n_as))
  where id = cid;

  insert into complaint_events (complaint_id, actor_id, type, note_en, note_as)
  values (cid, null, 'assigned', n_en, n_as);

  insert into notifications (user_id, complaint_id, title_en, title_as)
  values (pick.id, cid, c.code || ': New job assigned to you', c.code || ': আপোনাক এটা নতুন কাম দিয়া হৈছে');

  return jsonb_build_object('id', pick.id, 'name', pick.full_name, 'note_en', n_en, 'note_as', n_as);
end $$;
revoke execute on function auto_assign_complaint(uuid) from public, anon, authenticated;
grant execute on function auto_assign_complaint(uuid) to service_role;

-- =====================================================================================================
-- 6. Member management helpers (service role only; the API checks super_admin first)
-- =====================================================================================================
create or replace function admin_find_user(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;
revoke execute on function admin_find_user(text) from public, anon, authenticated;
grant execute on function admin_find_user(text) to service_role;

create or replace function admin_user_emails(ids uuid[]) returns table (id uuid, email text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text from auth.users u where u.id = any (ids)
$$;
revoke execute on function admin_user_emails(uuid[]) from public, anon, authenticated;
grant execute on function admin_user_emails(uuid[]) to service_role;
