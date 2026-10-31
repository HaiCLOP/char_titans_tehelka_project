-- Migration 16: optional auto-assignment of emergencies (fights, harassment, injuries...).
-- Off by default. When a super admin turns on app_config.auto_assign_emergency, an urgent report is assigned
-- straight away to someone in the department it was routed to (Security Office for safety reports):
--   * sensitive (harassment, personal safety) → the department admin with the fewest open jobs,
--     because sensitive reports are admins-only (migration 11);
--   * otherwise → the top field staff from rank_assignees, falling back to a department admin.
-- The normal safe auto-assign rule (auto_assign_complaint) is unchanged.

insert into app_config (key, value) values ('auto_assign_emergency', '{"enabled": false}')
on conflict (key) do nothing;

create or replace function auto_assign_emergency(cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c complaints%rowtype;
  pick_id uuid; pick_name text;
  n_en text; n_as text;
begin
  if coalesce((select (value ->> 'enabled')::boolean from app_config where key = 'auto_assign_emergency'), false) is not true then
    return null;
  end if;

  select * into c from complaints where id = cid for update;
  if not found or not c.is_urgent or c.assignee_id is not null or c.department_id is null or c.parent_id is not null
     or c.status not in ('submitted', 'needs_review', 'triaged') then
    return null;
  end if;

  if not c.is_sensitive then
    select r.id, r.full_name into pick_id, pick_name from rank_assignees(cid) r limit 1;
  end if;
  if pick_id is null then
    select p.id, p.full_name into pick_id, pick_name
    from profiles p
    left join lateral (
      select count(*) as n from complaints x where x.assignee_id = p.id and x.status in ('assigned', 'in_progress')
    ) j on true
    where p.role = 'dept_admin' and p.department_id = c.department_id and coalesce(p.active, true)
    order by j.n, p.last_assigned_at nulls first, p.id
    limit 1;
  end if;
  if pick_id is null then
    return null;
  end if;

  -- The transition table has no direct move from needs_review / submitted to assigned.
  if c.status <> 'triaged' then
    update complaints set status = 'triaged' where id = cid;
  end if;

  n_en := 'Emergency auto-assigned to ' || coalesce(pick_name, 'staff');
  n_as := 'জৰুৰীকালীন অভিযোগ স্বয়ংক্ৰিয়ভাৱে ' || coalesce(pick_name, 'কৰ্মচাৰী') || 'ক দিয়া হ''ল';

  update complaints
  set assignee_id = pick_id,
      status = 'assigned',
      ai_meta = coalesce(ai_meta, '{}'::jsonb) || jsonb_build_object(
        'auto_assigned', true,
        'auto_assigned_to', pick_id,
        'auto_assigned_at', now(),
        'emergency_assigned', true,
        'assign_reason', jsonb_build_object('name', pick_name, 'note_en', n_en, 'note_as', n_as))
  where id = cid;

  insert into complaint_events (complaint_id, actor_id, type, note_en, note_as)
  values (cid, null, 'assigned', n_en, n_as);

  perform notify_user(pick_id, cid, c.code || ': Emergency assigned to you', c.code || ': আপোনাক এটা জৰুৰীকালীন অভিযোগ দিয়া হৈছে');

  return jsonb_build_object('id', pick_id, 'name', pick_name, 'note_en', n_en, 'note_as', n_as);
end $$;
revoke execute on function auto_assign_emergency(uuid) from public, anon, authenticated;
grant execute on function auto_assign_emergency(uuid) to service_role;
