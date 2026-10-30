-- Migration 5: fixes from the Supabase security advisor.

-- ---------- 1. Duplicate search never leaks private tickets ----------
-- match_complaints is SECURITY DEFINER (it must search across users). By default it now returns only
-- public, non-sensitive tickets. Private/sensitive matches are returned only to admins (S15) or to the
-- service role (engine, server pipeline) when include_private is requested.
drop function if exists match_complaints(vector, real, int, uuid, int);
create or replace function match_complaints(
  query_embedding vector(768), match_threshold real default 0.80, match_count int default 5,
  filter_location uuid default null, within_days int default 14, include_private boolean default false
) returns table (id uuid, code text, title_en text, title_as text, status complaint_status, location_id uuid, metoo_count int, similarity real)
language sql stable security definer set search_path = public as $$
  select c.id, c.code, c.title_en, c.title_as, c.status, c.location_id, c.metoo_count,
         (1 - (c.embedding <=> query_embedding))::real as similarity
  from complaints c
  where c.embedding is not null
    and c.parent_id is null
    and c.status not in ('resolved','closed','rejected','duplicate')
    and c.created_at > now() - make_interval(days => within_days)
    and (filter_location is null or c.location_id = filter_location)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
    and (
      (c.visibility = 'public' and not c.is_sensitive)
      or (include_private and (is_admin() or auth.role() = 'service_role'))
    )
  order by c.embedding <=> query_embedding
  limit match_count
$$;
revoke execute on function match_complaints(vector, real, int, uuid, int, boolean) from public, anon;
grant execute on function match_complaints(vector, real, int, uuid, int, boolean) to authenticated, service_role;

-- ---------- 2. Me too only on tickets the caller may see ----------
create or replace function support_complaint(cid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from complaints where id = cid and visibility = 'public' and not is_sensitive and parent_id is null) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into complaint_supporters (complaint_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  if not found then select metoo_count into n from complaints where id = cid; return n; end if;
  update complaints set metoo_count = metoo_count + 1,
    priority = case when metoo_count + 1 in (5, 10) then greatest(priority - 1, 1) else priority end
  where id = cid returning metoo_count into n;
  insert into complaint_events (complaint_id, actor_id, type) values (cid, auth.uid(), 'metoo');
  return n;
end $$;

-- ---------- 3. Who may call which RPC ----------
-- Signed-in only: personal or admin-oriented functions.
revoke execute on function support_complaint(uuid) from public, anon;
grant execute on function support_complaint(uuid) to authenticated;
revoke execute on function check_rate_limit(int) from public, anon;
grant execute on function check_rate_limit(int) to authenticated;
revoke execute on function top_locations(uuid, int, int) from public, anon;
grant execute on function top_locations(uuid, int, int) to authenticated, service_role;
revoke execute on function department_load() from public, anon;
grant execute on function department_load() to authenticated, service_role;
-- dashboard_stats, trend_by_day, category_breakdown stay public: aggregate counts only, used by the
-- signed-out home page (S01) and Campus Pulse (S02).
-- current_role_is / my_role / is_admin / my_department stay executable: RLS policies call them for every
-- role, and they only describe the caller.

-- Trigger functions are never meant to be called over the API (triggers still fire after this revoke).
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function complaints_after_write() from public, anon, authenticated;
revoke execute on function complaints_before_write() from public, anon, authenticated;
revoke execute on function enforce_transition() from public, anon, authenticated;
revoke execute on function app_config_touch() from public, anon, authenticated;

-- ---------- 4. Fixed search_path on the remaining functions ----------
alter function complaints_before_write() set search_path = public;
alter function enforce_transition() set search_path = public;
alter function app_config_touch() set search_path = public;

-- ---------- 5. The UI reads valid transitions (GET /api/meta/transitions, PRD 8.2) ----------
create policy "transitions readable" on status_transitions for select to anon, authenticated using (true);
grant select on status_transitions to anon, authenticated;

-- complaints_public stays a definer view on purpose: it is the only way signed-out visitors see public
-- tickets, and it exposes no reporter, no original text and nothing private or sensitive.
