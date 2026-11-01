-- Migration: student badges and weekly reporting streak (computed, never hand-awarded).
-- my_badges() looks only at the caller's own data: complaints they reported (complaints.user_id, or
-- complaint_owners for anonymous reports — migration 13), their "me too"s (complaint_supporters) and the
-- ratings they gave on their own reports. Nothing about anyone else is read or returned.
--
-- Returns jsonb:
--   { "badges": [{ "id", "earned", "progress", "target", "earned_at" }...],
--     "streak": { "current", "best", "this_week" }, "reports": n }
-- Weeks are ISO weeks (Monday start) in campus time (Asia/Kolkata). The current streak stays alive until the
-- end of the week after the last reported week, so it does not reset on Monday morning.

create or replace function my_badges() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select auth.uid() as uid
  ), mine as (
    select c.id, c.category, c.status, c.rating, c.resolved_at, c.created_at
    from complaints c, me
    where me.uid is not null
      and (c.user_id = me.uid
           or exists (select 1 from complaint_owners o where o.complaint_id = c.id and o.user_id = me.uid))
  ), ordered as (
    select m.*, row_number() over (order by m.created_at) as n from mine m
  ), supports as (
    select s.created_at, row_number() over (order by s.created_at) as n
    from complaint_supporters s, me
    where s.user_id = me.uid and not exists (select 1 from mine m where m.id = s.complaint_id)
  ), fixed as (
    select coalesce(m.resolved_at, m.created_at) as at, row_number() over (order by coalesce(m.resolved_at, m.created_at)) as n
    from mine m where m.status in ('resolved', 'closed')
  ), rated as (
    select coalesce(m.resolved_at, m.created_at) as at, row_number() over (order by coalesce(m.resolved_at, m.created_at)) as n
    from mine m where m.rating is not null
  ), cat as (
    select m.created_at, m.category,
           row_number() over (partition by case when m.category in ('water_supply', 'plumbing') then 'water'
                                                when m.category = 'electrical' then 'power'
                                                when m.category = 'sanitation' then 'clean' end
                              order by m.created_at) as n,
           case when m.category in ('water_supply', 'plumbing') then 'water'
                when m.category = 'electrical' then 'power'
                when m.category = 'sanitation' then 'clean' end as grp
    from mine m
  ), weeks as (
    select distinct date_trunc('week', m.created_at at time zone 'Asia/Kolkata')::date as wk from mine m
  ), islands as (
    select wk, wk - (7 * row_number() over (order by wk))::int as grp from weeks
  ), runs as (
    select min(wk) as first_wk, max(wk) as last_wk, count(*)::int as len from islands group by grp
  ), now_wk as (
    select date_trunc('week', now() at time zone 'Asia/Kolkata')::date as wk
  ), streak as (
    select
      coalesce((select r.len from runs r, now_wk w where r.last_wk >= w.wk - 7 order by r.last_wk desc limit 1), 0) as current,
      coalesce((select max(r.len) from runs r), 0) as best,
      exists (select 1 from weeks, now_wk w where weeks.wk = w.wk) as this_week
  ), streak_hit as (
    -- When a 3-week run was first reached: the 3rd week of the earliest run that is at least 3 long.
    select (r.first_wk + 14)::timestamp as at from runs r where r.len >= 3 order by r.first_wk limit 1
  ), counts as (
    select
      (select count(*) from mine)::int as reports,
      (select count(*) from supports)::int as supports,
      (select count(*) from fixed)::int as fixed,
      (select count(*) from rated)::int as rated,
      (select count(*) from cat where grp = 'water')::int as water,
      (select count(*) from cat where grp = 'power')::int as power,
      (select count(*) from cat where grp = 'clean')::int as clean
  ), defs (ord, id, target, progress, earned_at) as (
    select 1, 'first_report', 1, k.reports, (select created_at from ordered where n = 1) from counts k
    union all select 2, 'five_reports', 5, k.reports, (select created_at from ordered where n = 5) from counts k
    union all select 3, 'ten_reports', 10, k.reports, (select created_at from ordered where n = 10) from counts k
    union all select 4, 'helper', 5, k.supports, (select created_at from supports where n = 5) from counts k
    union all select 5, 'fixer_friend', 1, k.fixed, (select at from fixed where n = 1) from counts k
    union all select 6, 'feedback_giver', 3, k.rated, (select at from rated where n = 3) from counts k
    union all select 7, 'water_watcher', 3, k.water, (select created_at from cat where grp = 'water' and n = 3) from counts k
    union all select 8, 'power_patrol', 3, k.power, (select created_at from cat where grp = 'power' and n = 3) from counts k
    union all select 9, 'clean_campus', 3, k.clean, (select created_at from cat where grp = 'clean' and n = 3) from counts k
    union all select 10, 'streak_3', 3, s.best, (select at at time zone 'Asia/Kolkata' from streak_hit) from streak s
  )
  select case when (select uid from me) is null then null else jsonb_build_object(
    'badges', (select jsonb_agg(jsonb_build_object(
                 'id', d.id,
                 'earned', d.progress >= d.target,
                 'progress', least(d.progress, d.target),
                 'target', d.target,
                 'earned_at', case when d.progress >= d.target then d.earned_at end) order by d.ord)
               from defs d),
    'streak', (select jsonb_build_object('current', s.current, 'best', s.best, 'this_week', s.this_week) from streak s),
    'reports', (select reports from counts)
  ) end
$$;
revoke execute on function my_badges() from public, anon;
grant execute on function my_badges() to authenticated;
