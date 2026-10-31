-- Migration 18: assignment workflow.
--   * staff experience: points and a level (1 newbie … 4 expert) from finished work, visible only to super
--     admins, the person's department admins and the person (staff_experience)
--   * severity matching: urgent / P1 work prefers experienced staff, P3–P4 work goes to newer staff so they
--     learn (rank_assignees gains an experience term)
--   * assignment mode for safe tickets (app_config.assign_mode): off | approval (AI proposes, an admin
--     approves) | auto (assign straight away, the old behaviour)
--   * teams: helpers on a ticket besides the lead assignee (complaint_helpers); emergency auto-assignment can
--     send a team (app_config.auto_assign_emergency.team_size)

insert into app_config (key, value) values ('assign_mode', '{"mode": "approval"}') on conflict (key) do nothing;
update app_config set value = value || '{"team_size": 1}'::jsonb
  where key = 'auto_assign_emergency' and not (value ? 'team_size');

-- ---------- helpers ----------
create table if not exists complaint_helpers (
  complaint_id uuid not null references complaints on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  added_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  primary key (complaint_id, user_id)
);
create index if not exists complaint_helpers_user on complaint_helpers (user_id);
alter table complaint_helpers enable row level security;
-- Written only by the API (service role) after its own checks.
drop policy if exists "helpers read" on complaint_helpers;
create policy "helpers read" on complaint_helpers for select using (
  user_id = auth.uid()
  or current_role_is('super_admin')
  or exists (select 1 from complaints c where c.id = complaint_id and current_role_is('dept_admin') and c.department_id = my_department())
  or exists (select 1 from complaints c where c.id = complaint_id and c.assignee_id = auth.uid())
);

create or replace function is_helper(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from complaint_helpers h where h.complaint_id = cid and h.user_id = auth.uid())
$$;
revoke execute on function is_helper(uuid) from public, anon;
grant execute on function is_helper(uuid) to authenticated;

drop policy if exists "complaints helper read" on complaints;
create policy "complaints helper read" on complaints for select using (is_helper(id) and not is_sensitive);

-- Sensitive tickets: helpers must be department admins too; new helpers are notified.
create or replace function complaint_helpers_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select id, code, is_sensitive, department_id, assignee_id into c from complaints where id = new.complaint_id;
  if c.is_sensitive and exists (select 1 from profiles p where p.id = new.user_id and p.role = 'field_staff') then
    raise exception 'SENSITIVE_ADMINS_ONLY' using errcode = '42501';
  end if;
  if new.user_id = c.assignee_id then
    return null; -- the lead is not also a helper
  end if;
  perform notify_user(new.user_id, c.id, c.code || ': You were added to the team', c.code || ': আপোনাক দলটোত যোগ কৰা হৈছে');
  return new;
end $$;
revoke execute on function complaint_helpers_check() from public, anon, authenticated;
drop trigger if exists complaint_helpers_check on complaint_helpers;
create trigger complaint_helpers_check before insert on complaint_helpers for each row execute function complaint_helpers_check();

-- ---------- experience ----------
-- Points per finished ticket (resolved or closed, as lead or helper):
--   priority P1 4 · P2 3 · P3 2 · P4 1, +2 urgent, +1 fixed before the SLA deadline, +1 rated 4–5, −1 rated 1–2.
-- Level: < 10 points → 1 newbie · < 30 → 2 · < 70 → 3 experienced · else 4 expert.
create or replace function experience_level(points int) returns int
language sql immutable as $$
  select case when points < 10 then 1 when points < 30 then 2 when points < 70 then 3 else 4 end
$$;

create or replace function staff_experience(uids uuid[])
returns table (user_id uuid, jobs_done int, points int, level int, avg_rating real, on_time_pct int, open_jobs int)
language sql stable security definer set search_path = public as $$
  with people as (
    select p.id from profiles p
    where p.id = any (uids)
      and (auth.role() = 'service_role'
           or p.id = auth.uid()
           or current_role_is('super_admin')
           or (current_role_is('dept_admin') and my_department() is not null and p.department_id = my_department()))
  ), work as (
    select x.uid, c.status, c.priority, c.is_urgent, c.rating, c.sla_due_at, c.resolved_at
    from complaints c
    cross join lateral (
      select c.assignee_id as uid
      union
      select h.user_id from complaint_helpers h where h.complaint_id = c.id
    ) x
    where x.uid in (select id from people) and c.parent_id is null
  ), scored as (
    select uid, status,
           case when status in ('resolved', 'closed') then
             (5 - priority) + (case when is_urgent then 2 else 0 end)
             + (case when resolved_at is not null and sla_due_at is not null and resolved_at <= sla_due_at then 1 else 0 end)
             + (case when rating >= 4 then 1 when rating between 1 and 2 then -1 else 0 end)
           else 0 end as pts,
           (status in ('resolved', 'closed')) as done,
           (status in ('resolved', 'closed') and resolved_at is not null and sla_due_at is not null and resolved_at <= sla_due_at) as on_time,
           rating
    from work
  )
  select p.id,
         coalesce(count(*) filter (where s.done), 0)::int,
         greatest(coalesce(sum(s.pts), 0), 0)::int,
         experience_level(greatest(coalesce(sum(s.pts), 0), 0)::int),
         avg(s.rating) filter (where s.done and s.rating is not null)::real,
         case when count(*) filter (where s.done) = 0 then null
              else round(100.0 * count(*) filter (where s.on_time) / count(*) filter (where s.done))::int end,
         coalesce(count(*) filter (where s.status in ('assigned', 'in_progress')), 0)::int
  from people p
  left join scored s on s.uid = p.id
  group by p.id
$$;
revoke execute on function staff_experience(uuid[]) from public, anon;
grant execute on function staff_experience(uuid[]) to authenticated, service_role;

-- ---------- ranking with experience ----------
drop function if exists rank_assignees(uuid);
create function rank_assignees(cid uuid)
returns table (id uuid, full_name text, score integer, skill_match boolean, skill_required boolean, covers boolean,
               open_jobs integer, last_assigned_at timestamptz, level integer, jobs_done integer, fit boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  c_dept uuid; c_cat complaint_category; c_loc uuid; c_pri int; c_urgent boolean;
  need_skill boolean;
  want text;
begin
  select x.department_id, x.category, x.location_id, x.priority, x.is_urgent
    into c_dept, c_cat, c_loc, c_pri, c_urgent from complaints x where x.id = cid;
  if not found then
    return;
  end if;
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
  -- Severe work → experienced people; routine work → newer people, so they gain experience.
  want := case when c_urgent or c_pri = 1 then 'senior' when c_pri = 2 then 'mid' else 'junior' end;

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
  ), exp as (
    select e.user_id, e.level, e.jobs_done from staff_experience(array(select s.id from staff s)) e
  ), jobs as (
    select x.assignee_id, count(*)::int as n
    from complaints x
    where x.status in ('assigned', 'in_progress') and x.assignee_id in (select s.id from staff s)
    group by x.assignee_id
  ), scored as (
    select s.*, coalesce(j.n, 0) as n, coalesce(e.level, 1) as lvl, coalesce(e.jobs_done, 0) as done,
           case want
             when 'senior' then (case when coalesce(e.level, 1) >= 3 then 25 when coalesce(e.level, 1) = 2 then 10 else 0 end)
             when 'mid' then (case when coalesce(e.level, 1) >= 2 then 20 else 5 end)
             else (case when coalesce(e.level, 1) = 1 then 20 when coalesce(e.level, 1) = 2 then 10 else 0 end)
           end as exp_pts
    from staff s
    left join jobs j on j.assignee_id = s.id
    left join exp e on e.user_id = s.id
  )
  select s.id, s.full_name,
         ((case when s.skill_match then 40 when not need_skill then 20 else 0 end)
          + (case when s.covers then 30 else 0 end)
          + greatest(0, 30 - 10 * s.n)
          + s.exp_pts)::int,
         s.skill_match, need_skill, s.covers, s.n, s.last_assigned_at, s.lvl, s.done, s.exp_pts >= 20
  from scored s
  where not need_skill or s.skill_match
  order by 3 desc, s.n asc, s.last_assigned_at asc nulls first, s.id;
end $$;
revoke execute on function rank_assignees(uuid) from public, anon;
grant execute on function rank_assignees(uuid) to authenticated, service_role;

-- ---------- safe auto-assignment with modes ----------
create or replace function auto_assign_complaint(cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c complaints%rowtype;
  pick record;
  mode text := coalesce((select value ->> 'mode' from app_config where key = 'assign_mode'), 'approval');
  loc_en text; loc_as text;
  cat_en text; cat_as text;
  parts_en text[] := '{}'; parts_as text[] := '{}';
  n_en text; n_as text;
  digits text;
  conf real;
  m uuid;
begin
  if mode = 'off' then
    return null;
  end if;
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
  if pick.fit then
    parts_en := parts_en || 'experience fits the severity'::text;
    parts_as := parts_as || 'অভিজ্ঞতা গুৰুত্বৰ সৈতে মিলে'::text;
  end if;
  digits := translate(pick.open_jobs::text, '0123456789', '০১২৩৪৫৬৭৮৯');
  parts_en := parts_en || (pick.open_jobs || case when pick.open_jobs = 1 then ' open job' else ' open jobs' end);
  parts_as := parts_as || (digits || 'টা খোলা কাম');

  -- How sure the suggestion is: match quality (score out of 125) weighted with the AI's intake confidence.
  conf := round((least(1.0, pick.score / 125.0) * 0.7 + coalesce((c.ai_meta ->> 'confidence')::real, 0) * 0.3)::numeric, 2);

  if mode = 'approval' then
    n_en := 'Suggested: ' || coalesce(pick.full_name, 'staff') || ' · ' || array_to_string(parts_en, ' · ');
    n_as := 'পৰামৰ্শ: ' || coalesce(pick.full_name, 'কৰ্মচাৰী') || ' · ' || array_to_string(parts_as, ' · ');
    update complaints
    set ai_meta = ai_meta || jsonb_build_object('assign_proposal', jsonb_build_object(
          'id', pick.id, 'name', pick.full_name, 'score', pick.score, 'confidence', conf, 'level', pick.level,
          'note_en', n_en, 'note_as', n_as, 'at', now()))
    where id = cid;
    for m in select ticket_managers(c.department_id) loop
      perform notify_user(m, cid, c.code || ': Assignment waiting for approval', c.code || ': দায়িত্ব অনুমোদনৰ বাবে অপেক্ষাত');
    end loop;
    return jsonb_build_object('proposed', true, 'id', pick.id, 'name', pick.full_name, 'confidence', conf, 'note_en', n_en, 'note_as', n_as);
  end if;

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
          'name', pick.full_name, 'score', pick.score, 'confidence', conf,
          'skill', pick.skill_match, 'skill_required', pick.skill_required,
          'covers', pick.covers, 'open_jobs', pick.open_jobs,
          'note_en', n_en, 'note_as', n_as))
  where id = cid;

  insert into complaint_events (complaint_id, actor_id, type, note_en, note_as)
  values (cid, null, 'assigned', n_en, n_as);

  perform notify_user(pick.id, cid, c.code || ': New job assigned to you', c.code || ': আপোনাক এটা নতুন কাম দিয়া হৈছে');

  return jsonb_build_object('id', pick.id, 'name', pick.full_name, 'note_en', n_en, 'note_as', n_as);
end $$;
revoke execute on function auto_assign_complaint(uuid) from public, anon, authenticated;
grant execute on function auto_assign_complaint(uuid) to service_role;

-- ---------- emergencies: optional team ----------
create or replace function auto_assign_emergency(cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb := coalesce((select value from app_config where key = 'auto_assign_emergency'), '{}'::jsonb);
  team int := least(greatest(coalesce((cfg ->> 'team_size')::int, 1), 1), 4);
  c complaints%rowtype;
  ids uuid[]; names text[];
  n_en text; n_as text;
  i int;
begin
  if coalesce((cfg ->> 'enabled')::boolean, false) is not true then
    return null;
  end if;

  select * into c from complaints where id = cid for update;
  if not found or not c.is_urgent or c.assignee_id is not null or c.department_id is null or c.parent_id is not null
     or c.status not in ('submitted', 'needs_review', 'triaged') then
    return null;
  end if;

  -- Most experienced first (rank_assignees already prefers senior people for urgent work); sensitive → admins.
  if not c.is_sensitive then
    select array_agg(r.id), array_agg(coalesce(r.full_name, 'staff')) into ids, names
    from (select * from rank_assignees(cid) limit team) r;
  end if;
  if ids is null or cardinality(ids) < team then
    select coalesce(ids, '{}') || array_agg(a.id), coalesce(names, '{}') || array_agg(coalesce(a.full_name, 'admin'))
      into ids, names
    from (
      select p.id, p.full_name
      from profiles p
      left join lateral (
        select count(*) as n from complaints x where x.assignee_id = p.id and x.status in ('assigned', 'in_progress')
      ) j on true
      where p.role = 'dept_admin' and p.department_id = c.department_id and coalesce(p.active, true)
        and not (p.id = any (coalesce(ids, '{}')))
      order by j.n, p.last_assigned_at nulls first, p.id
      limit team - coalesce(cardinality(ids), 0)
    ) a;
  end if;
  if ids is null or cardinality(ids) = 0 or ids[1] is null then
    return null;
  end if;

  if c.status <> 'triaged' then
    update complaints set status = 'triaged' where id = cid;
  end if;

  n_en := 'Emergency auto-assigned to ' || array_to_string(names, ', ');
  n_as := 'জৰুৰীকালীন অভিযোগ স্বয়ংক্ৰিয়ভাৱে দিয়া হ''ল: ' || array_to_string(names, ', ');

  update complaints
  set assignee_id = ids[1],
      status = 'assigned',
      ai_meta = coalesce(ai_meta, '{}'::jsonb) || jsonb_build_object(
        'auto_assigned', true,
        'auto_assigned_to', ids[1],
        'auto_assigned_at', now(),
        'emergency_assigned', true,
        'assign_reason', jsonb_build_object('name', names[1], 'note_en', n_en, 'note_as', n_as))
  where id = cid;

  for i in 2 .. cardinality(ids) loop
    insert into complaint_helpers (complaint_id, user_id, added_by) values (cid, ids[i], null) on conflict do nothing;
  end loop;

  insert into complaint_events (complaint_id, actor_id, type, note_en, note_as)
  values (cid, null, 'assigned', n_en, n_as);

  perform notify_user(ids[1], cid, c.code || ': Emergency assigned to you', c.code || ': আপোনাক এটা জৰুৰীকালীন অভিযোগ দিয়া হৈছে');

  return jsonb_build_object('id', ids[1], 'name', names[1], 'team', to_jsonb(ids), 'note_en', n_en, 'note_as', n_as);
end $$;
revoke execute on function auto_assign_emergency(uuid) from public, anon, authenticated;
grant execute on function auto_assign_emergency(uuid) to service_role;
