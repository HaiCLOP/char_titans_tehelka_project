-- Migration 6: column-level integrity + public read privacy.
--
-- Fixes four holes found while testing as role `authenticated`:
--   1. A reporter (or assignee) could UPDATE any column of their ticket over REST (priority, metoo_count,
--      titles, assignee_id, sla_due_at …). → column guard trigger + `with check` on the assignee policy.
--   2. "complaints public read" exposed full rows of public tickets (user_id + original_text of anonymous
--      reporters, ai_meta, photo paths that start with the reporter's uid); complaint_events.actor_id leaked
--      the same way. → policy dropped; public reads go through complaints_public + public_complaint_events().
--   3. A user could rewrite the text of their own notifications. → `with check` + guard: only `read` changes.
--   4. The reporter was notified about their own confirm/reopen, while the people who must act were not.
--
-- "Non-service caller" below means current_user is `authenticated` or `anon`, i.e. a PostgREST request.
-- The service role (server pipeline, Go engine workers) and SECURITY DEFINER functions owned by postgres
-- (support_complaint bumps metoo_count/priority) run as another role and are not affected.

-- =====================================================================================================
-- 1. Column guard on complaints
-- =====================================================================================================
-- BEFORE row triggers fire in name order: complaints_a_column_guard → complaints_bw → complaints_transition.
-- The guard runs first, so it compares exactly what the caller sent; complaints_bw then maintains
-- updated_at / sla_due_at / resolved_at. Only updated_at is ignored (complaints_bw always overwrites it), so a
-- caller can never forge sla_due_at or resolved_at either.
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

  -- Admins who may manage this ticket keep full control (RLS decides which rows they reach).
  is_mgr := current_role_is('super_admin')
    or (current_role_is('dept_admin') and old.department_id is not distinct from my_department() and old.department_id is not null);
  if is_mgr then
    return new;
  end if;

  is_owner := old.user_id = uid;
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

  -- Which status moves each non-admin role may make (on top of the generic status_transitions table).
  if new.status is distinct from old.status then
    if is_owner then
      -- Confirm fixed / not fixed.
      if old.status = 'resolved' and new.status in ('closed', 'in_progress') then
        status_ok := true;
      -- Reopen within 7 days of closing.
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
revoke execute on function complaints_column_guard() from public, anon, authenticated;

drop trigger if exists complaints_a_column_guard on complaints;
create trigger complaints_a_column_guard before update on complaints
  for each row execute function complaints_column_guard();

-- The assignee must stay the assignee after their own update (no handing the ticket to someone else).
drop policy if exists "complaints assignee update" on complaints;
create policy "complaints assignee update" on complaints for update
  using (assignee_id = auth.uid()) with check (assignee_id = auth.uid());

-- =====================================================================================================
-- 2. Public tickets: no full-row access
-- =====================================================================================================
-- Signed-in users no longer read public rows of the base table. Owner / admin / assignee policies stay, so
-- those paths (and complaint_events / messages, whose policies follow complaints visibility) are unchanged.
drop policy if exists "complaints public read" on complaints;

-- Definer view (security_invoker = false, owner postgres): the only public window onto complaints.
-- Never: user_id, anonymous, original_text, ai_meta, ai_status, embedding, assignee_id, parent_id,
-- is_sensitive, dup_score, sla_alerted_at — and no storage paths (image_urls / resolution_photo_url start
-- with the uploader's uid). The API signs public photos server-side with the service role.
drop view if exists complaints_public;
create view complaints_public with (security_invoker = false) as
  select id, code, title_en, title_as, summary_en, summary_as, category, priority, status, location_id,
         metoo_count, created_at, resolved_at,
         -- added in migration 6
         original_lang, updated_at, sla_due_at, is_urgent, visibility, location_note, department_id,
         resolution_note_en, resolution_note_as, rating, verified_by_reporter,
         cardinality(image_urls) as photo_count,
         (resolution_photo_url is not null) as has_resolution_photo
  from complaints
  where visibility = 'public' and not is_sensitive and parent_id is null;
revoke all on complaints_public from public;
grant select on complaints_public to anon, authenticated;

-- Timeline of a public ticket without actor ids. Empty unless the ticket is public, not sensitive, not merged.
-- actor_kind mirrors src/lib/tracking.ts: me | reporter | supporter | staff | system.
-- Notes written by the reporter (e.g. "not fixed" reasons) are hidden: like original_text, they are the
-- reporter's own words.
create or replace function public_complaint_events(cid uuid)
returns table (id bigint, type text, from_status complaint_status, to_status complaint_status,
               note_en text, note_as text, created_at timestamptz, actor_kind text)
language sql stable security definer set search_path = public as $$
  select e.id, e.type, e.from_status, e.to_status,
         case when e.actor_id is not distinct from c.user_id and e.actor_id is not null then null else e.note_en end,
         case when e.actor_id is not distinct from c.user_id and e.actor_id is not null then null else e.note_as end,
         e.created_at,
         case
           when e.actor_id is null then 'system'
           when e.actor_id = auth.uid() then 'me'
           when e.actor_id = c.user_id then 'reporter'
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
revoke execute on function public_complaint_events(uuid) from public, anon;
grant execute on function public_complaint_events(uuid) to authenticated;

-- =====================================================================================================
-- 3. Notifications: only `read` may change
-- =====================================================================================================
drop policy if exists "notifications mark read" on notifications;
create policy "notifications mark read" on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function notifications_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon')
     and (to_jsonb(new) - 'read') is distinct from (to_jsonb(old) - 'read') then
    raise exception 'FORBIDDEN_COLUMNS' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function notifications_guard() from public, anon, authenticated;

drop trigger if exists notifications_guard on notifications;
create trigger notifications_guard before update on notifications
  for each row execute function notifications_guard();

-- =====================================================================================================
-- 4. Status notifications: not to the actor-reporter; "not fixed"/reopen goes to the people who act
-- =====================================================================================================
create or replace function complaints_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_en text; s_as text; uid uuid := auth.uid(); t_en text; t_as text;
begin
  if tg_op = 'INSERT' then
    insert into complaint_events (complaint_id, actor_id, type, to_status) values (new.id, new.user_id, 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into complaint_events (complaint_id, actor_id, type, from_status, to_status) values (new.id, uid, 'status', old.status, new.status);
    s_en := initcap(replace(new.status::text, '_', ' '));
    s_as := case new.status
      when 'triaged' then 'পৰীক্ষা কৰা হ''ল' when 'assigned' then 'দায়িত্ব দিয়া হ''ল' when 'in_progress' then 'কাম চলি আছে'
      when 'resolved' then 'সমাধান হ''ল' when 'closed' then 'বন্ধ' when 'duplicate' then 'একে অভিযোগৰ সৈতে যোগ কৰা হ''ল'
      when 'rejected' then 'নাকচ' when 'needs_review' then 'পুনৰীক্ষণ প্ৰয়োজন' else 'আপডেট হ''ল' end;

    -- The reporter hears about changes made by others, not about their own confirm / reopen.
    if new.user_id is not null and uid is distinct from new.user_id then
      insert into notifications (user_id, complaint_id, title_en, title_as)
      values (new.user_id, new.id, new.code || ': ' || s_en, new.code || ': ' || s_as);
    end if;

    -- Reporter says "not fixed" (resolved → in_progress) or reopens (closed → in_progress):
    -- tell the assignee and the department's admins.
    if uid is not null and uid = new.user_id and new.status = 'in_progress' and old.status in ('resolved', 'closed') then
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
      where r.id is distinct from new.user_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function complaints_after_write() from public, anon, authenticated;
