-- Optional short comment the reporter leaves with the 1-5 rating when confirming a fix (S08).
-- Owners set it through the existing verify flow, so the column guard lets owners change it too.

alter table public.complaints
  add column if not exists rating_comment text;

alter table public.complaints
  drop constraint if exists complaints_rating_comment_len;
alter table public.complaints
  add constraint complaints_rating_comment_len
  check (rating_comment is null or char_length(rating_comment) between 1 and 280);

-- Copied from the live definition (pg_get_functiondef, 2 Nov); only change: 'rating_comment' in the owner list.
create or replace function public.complaints_column_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
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
    allowed := allowed || array['status', 'rating', 'rating_comment', 'verified_by_reporter'];
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
end $function$;
