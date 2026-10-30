-- Adds from the master PRD review: field staff role, assignment, visibility, sensitivity, urgency, valid transitions.
alter type user_role add value if not exists 'field_staff' before 'dept_admin';
create type complaint_visibility as enum ('public','private');

alter table complaints
  add column visibility complaint_visibility not null default 'public',
  add column is_sensitive boolean not null default false,   -- harassment, safety, personal matters → always private, admins only
  add column is_urgent boolean not null default false,      -- AI or reporter flagged immediate danger → emergency guidance shown
  add column assignee_id uuid references profiles,
  add column resolution_note_en text, add column resolution_note_as text,
  add column resolution_photo_url text,
  add column verified_by_reporter boolean;

-- sensitive ⇒ private (DB-enforced)
alter table complaints add constraint sensitive_is_private check (not is_sensitive or visibility = 'private');

-- internal (staff/admin only) vs public messages
alter table messages add column internal boolean not null default false;

-- allowed status transitions (enforced by trigger; super_admin may override via service role)
create table status_transitions (from_status complaint_status, to_status complaint_status, primary key (from_status, to_status));
insert into status_transitions values
 ('submitted','triaged'),('submitted','needs_review'),('submitted','duplicate'),('submitted','rejected'),
 ('needs_review','triaged'),('needs_review','rejected'),('needs_review','duplicate'),
 ('triaged','assigned'),('triaged','duplicate'),('triaged','rejected'),
 ('assigned','in_progress'),('assigned','triaged'),
 ('in_progress','resolved'),('in_progress','assigned'),
 ('resolved','closed'),('resolved','in_progress'),          -- reporter confirms / reopens
 ('closed','in_progress'),                                   -- reopen within 7 days
 ('duplicate','triaged');                                    -- admin unmerge

create or replace function enforce_transition() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null
     and not exists (select 1 from status_transitions where from_status = old.status and to_status = new.status) then
    raise exception 'INVALID_TRANSITION %->%', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger complaints_transition before update on complaints for each row execute function enforce_transition();

-- RLS: field staff see + update what is assigned to them; public issues visible to all signed-in users
create policy "complaints assignee read" on complaints for select using (assignee_id = auth.uid());
create policy "complaints assignee update" on complaints for update using (assignee_id = auth.uid());
create policy "complaints public read" on complaints for select to authenticated
  using (visibility = 'public' and not is_sensitive and parent_id is null);

-- internal messages hidden from reporters
drop policy "messages visible with complaint" on messages;
create policy "messages visible with complaint" on messages for select using (
  exists (select 1 from complaints c where c.id = complaint_id)
  and (not internal or is_admin() or exists (select 1 from complaints c where c.id = complaint_id and c.assignee_id = auth.uid()))
);

-- public view for Campus Pulse / map: no reporter, no sensitive, no private
create view complaints_public with (security_invoker = false) as
  select id, code, title_en, title_as, summary_en, summary_as, category, priority, status, location_id,
         metoo_count, created_at, resolved_at
  from complaints
  where visibility = 'public' and not is_sensitive and parent_id is null;
grant select on complaints_public to anon, authenticated;

create index complaints_assignee on complaints (assignee_id, status);
