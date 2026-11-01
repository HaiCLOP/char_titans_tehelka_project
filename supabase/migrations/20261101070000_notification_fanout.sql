-- Migration 15: notifications for the people who work tickets, not only the reporter.
-- Before this, only status changes (to the reporter), auto-assignment and SLA alerts created notifications.
-- Adds: new tickets that need review or are urgent (department admins), manual assignment (assignee),
-- and chat messages (the other side of the conversation). Titles carry only the ticket code, never the
-- reporter, so anonymous reports stay anonymous.

-- One unread notification per person, ticket and title is enough; repeats are skipped.
create or replace function notify_user(uid uuid, cid uuid, t_en text, t_as text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, complaint_id, title_en, title_as)
  select uid, cid, t_en, t_as
  where uid is not null
    and not exists (select 1 from notifications n
                    where n.user_id = uid and n.complaint_id = cid and n.title_en = t_en and not n.read)
$$;
revoke execute on function notify_user(uuid, uuid, text, text) from public, anon, authenticated;

-- Department admins of a department; super admins when the ticket has no department yet.
create or replace function ticket_managers(dept uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from profiles p
  where coalesce(p.active, true)
    and ((dept is not null and p.role = 'dept_admin' and p.department_id = dept)
      or (dept is null and p.role = 'super_admin'))
$$;
revoke execute on function ticket_managers(uuid) from public, anon, authenticated;

-- ---------- tickets: needs review / urgent / assigned ----------
create or replace function complaints_notify_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m uuid; rep uuid;
begin
  if new.parent_id is not null then
    return null;
  end if;
  rep := complaint_reporter(new.id);

  if new.is_urgent and (tg_op = 'INSERT' or not old.is_urgent) then
    for m in select ticket_managers(new.department_id) loop
      if m is distinct from rep then
        perform notify_user(m, new.id, new.code || ': Urgent report', new.code || ': জৰুৰী অভিযোগ');
      end if;
    end loop;
  elsif new.status = 'needs_review' and (tg_op = 'INSERT' or old.status is distinct from 'needs_review') then
    for m in select ticket_managers(new.department_id) loop
      if m is distinct from rep then
        perform notify_user(m, new.id, new.code || ': New report needs review', new.code || ': নতুন অভিযোগ পুনৰীক্ষণৰ বাবে');
      end if;
    end loop;
  end if;

  -- Manual assignment. auto_assign_complaint() writes its own notification (it also sets auto_assigned_to).
  if tg_op = 'UPDATE' and new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is distinct from uid
     and (new.ai_meta -> 'auto_assigned_to') is not distinct from (old.ai_meta -> 'auto_assigned_to') then
    perform notify_user(new.assignee_id, new.id, new.code || ': New job assigned to you', new.code || ': আপোনাক এটা নতুন কাম দিয়া হৈছে');
  end if;
  return null;
end $$;
revoke execute on function complaints_notify_staff() from public, anon, authenticated;

drop trigger if exists complaints_notify_staff on complaints;
create trigger complaints_notify_staff after insert or update of status, assignee_id, is_urgent on complaints
  for each row execute function complaints_notify_staff();

-- ---------- chat ----------
-- Reporter writes → assignee and department admins. Staff write → reporter (public messages only).
-- Internal notes → assignee and department admins, except the author.
create or replace function messages_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; rep uuid; uid uuid := coalesce(new.sender_id, auth.uid()); m uuid;
  t_en text; t_as text;
begin
  select id, code, department_id, assignee_id into c from complaints where id = new.complaint_id;
  if not found then return null; end if;
  rep := complaint_reporter(c.id);

  if new.internal then
    t_en := c.code || ': New internal note';
    t_as := c.code || ': নতুন আভ্যন্তৰীণ টোকা';
  else
    t_en := c.code || ': New message';
    t_as := c.code || ': নতুন বাৰ্তা';
  end if;

  if not new.internal and not new.from_reporter then
    if rep is distinct from uid then
      perform notify_user(rep, c.id, t_en, t_as);
    end if;
  end if;

  if new.internal or new.from_reporter then
    for m in select c.assignee_id union select ticket_managers(c.department_id) loop
      if m is not null and m is distinct from uid and m is distinct from rep then
        perform notify_user(m, c.id, t_en, t_as);
      end if;
    end loop;
  end if;
  return null;
end $$;
revoke execute on function messages_notify() from public, anon, authenticated;

drop trigger if exists messages_notify on messages;
create trigger messages_notify after insert on messages for each row execute function messages_notify();
