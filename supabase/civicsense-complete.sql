-- CivicSense: complete fresh Supabase database setup
-- Generated from 21 repository migrations plus supabase/seed.sql.
-- Regenerate: node scripts/export-sql.mjs
-- Run ONCE in a NEW Supabase project's SQL Editor as postgres.
-- Requires Supabase-managed auth/storage schemas, roles, Realtime publication,
-- and the vector, pg_trgm and pgmq extensions supported by the project.
-- This is the application schema and starter data, not a live database backup.
-- It contains no user accounts, report history, uploaded files, passwords or API keys.
-- Do not run on an existing CivicSense database or mix with migration-runner setup.
-- Fresh-install adaptations: field_staff is defined in the original role enum
-- to avoid PostgreSQL enum transaction restrictions; the optional Supabase
-- rls_auto_enable function is hardened only if it exists.

begin;
set local search_path = public, extensions;
do $fresh_install$
begin
  if to_regclass('public.profiles') is not null
     or to_regclass('public.complaints') is not null
     or to_regclass('public.departments') is not null then
    raise exception 'CivicSense tables already exist. Apply only pending migrations instead.';
  end if;
end
$fresh_install$;

-- Source: supabase/migrations/20261030000000_init.sql
-- CivicSense — initial schema
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type user_role as enum ('student','staff','field_staff','dept_admin','super_admin');
create type complaint_status as enum ('submitted','triaged','needs_review','assigned','in_progress','resolved','closed','duplicate','rejected');
create type complaint_category as enum ('water_supply','plumbing','electrical','sanitation','hostel','mess_food','infrastructure','it_network','academic','safety_security','transport','other');
create type ai_status as enum ('pending','done','failed','fallback');

-- ---------- core tables ----------
create table departments (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_as text not null,
  categories complaint_category[] not null default '{}',
  sla_hours jsonb not null default '{"1":4,"2":24,"3":72,"4":168}',
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_as text not null,
  type text not null default 'building',
  lat double precision,
  lng double precision,
  map_x real, -- position on the illustrated campus image (0..1)
  map_y real
);
create index locations_name_trgm on locations using gin ((name_en || ' ' || name_as) gin_trgm_ops);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  avatar_url text,
  role user_role not null default 'student',
  lang_pref text not null default 'en' check (lang_pref in ('en','as')),
  theme text not null default 'tea',
  hostel text,
  department_id uuid references departments,
  created_at timestamptz not null default now()
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('CS-' || upper(substr(md5(random()::text), 1, 6))),
  user_id uuid references profiles on delete set null,
  anonymous boolean not null default false,
  original_text text not null default '',
  original_lang text not null default 'en' check (original_lang in ('en','as')),
  title_en text, title_as text,
  summary_en text, summary_as text,
  category complaint_category not null default 'other',
  priority smallint not null default 3 check (priority between 1 and 4),
  status complaint_status not null default 'submitted',
  location_id uuid references locations,
  location_note text,
  department_id uuid references departments,
  parent_id uuid references complaints on delete set null,
  dup_score real,
  metoo_count integer not null default 0,
  image_urls text[] not null default '{}',
  ai_status ai_status not null default 'pending',
  ai_meta jsonb not null default '{}',
  embedding vector(768),
  sla_due_at timestamptz,
  resolved_at timestamptz,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index complaints_embedding_hnsw on complaints using hnsw (embedding vector_cosine_ops);
create index complaints_dept_status on complaints (department_id, status, created_at desc);
create index complaints_user on complaints (user_id, created_at desc);
create index complaints_location on complaints (location_id, created_at desc);

create table complaint_events (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references complaints on delete cascade,
  actor_id uuid references profiles,
  type text not null, -- created | status | assigned | note | metoo | ai
  from_status complaint_status,
  to_status complaint_status,
  note_en text, note_as text,
  created_at timestamptz not null default now()
);
create index complaint_events_c on complaint_events (complaint_id, created_at);

create table complaint_supporters (
  complaint_id uuid references complaints on delete cascade,
  user_id uuid references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (complaint_id, user_id)
);

create table messages (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references complaints on delete cascade,
  sender_id uuid references profiles,
  body text not null,
  lang text not null default 'en',
  body_translated text,
  created_at timestamptz not null default now()
);
create index messages_c on messages (complaint_id, created_at);

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  complaint_id uuid references complaints on delete cascade,
  title_en text not null, title_as text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_u on notifications (user_id, read, created_at desc);

-- ---------- AI ops (server only) ----------
create table ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  model text not null,
  purpose text not null, -- intake | embed | dedup_verify | agent | reply_draft | translate_msg | resolution_check | daily_brief
  priority integer not null default 100,
  caps text[] not null default '{}',
  enabled boolean not null default true
);
create index ai_providers_p on ai_providers (purpose, priority);

create table ai_keys (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  label text not null,
  key_encrypted text not null, -- AES-256-GCM, see src/lib/ai/crypto.ts
  key_last4 text not null,
  enabled boolean not null default true,
  rpm_limit integer not null default 10,
  fail_count integer not null default 0,
  cooldown_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table ai_logs (
  id bigint generated always as identity primary key,
  purpose text not null,
  provider text, model text, key_label text,
  latency_ms integer,
  status text not null, -- ok | rate_limited | error | timeout | invalid | fallback
  error text,
  tokens_in integer, tokens_out integer,
  created_at timestamptz not null default now()
);
create index ai_logs_t on ai_logs (created_at desc);

create table ai_cache (
  hash text primary key,
  purpose text not null,
  response jsonb not null,
  expires_at timestamptz
);

-- ---------- helpers ----------
create or replace function current_role_is(r user_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = r)
$$;
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('dept_admin','super_admin'))
$$;
create or replace function my_department() returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from profiles where id = auth.uid()
$$;

-- new auth user → profile
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'avatar_url')
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- SLA + timestamps on complaints
create or replace function complaints_before_write() returns trigger
language plpgsql as $$
declare hours numeric;
begin
  new.updated_at := now();
  if new.department_id is not null and (tg_op = 'INSERT' or new.priority is distinct from old.priority or new.department_id is distinct from old.department_id) then
    select (sla_hours ->> new.priority::text)::numeric into hours from departments where id = new.department_id;
    if hours is not null then new.sla_due_at := new.created_at + make_interval(hours => hours::int); end if;
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then new.resolved_at := now(); end if;
  return new;
end $$;
create trigger complaints_bw before insert or update on complaints for each row execute function complaints_before_write();

-- status change → event + bilingual notification
create or replace function complaints_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare s_en text; s_as text;
begin
  if tg_op = 'INSERT' then
    insert into complaint_events (complaint_id, actor_id, type, to_status) values (new.id, new.user_id, 'created', new.status);
  elsif new.status is distinct from old.status then
    insert into complaint_events (complaint_id, actor_id, type, from_status, to_status) values (new.id, auth.uid(), 'status', old.status, new.status);
    s_en := initcap(replace(new.status::text, '_', ' '));
    s_as := case new.status
      when 'triaged' then 'পৰীক্ষা কৰা হ''ল' when 'assigned' then 'দায়িত্ব দিয়া হ''ল' when 'in_progress' then 'কাম চলি আছে'
      when 'resolved' then 'সমাধান হ''ল' when 'closed' then 'বন্ধ' when 'duplicate' then 'একে অভিযোগৰ সৈতে যোগ কৰা হ''ল'
      when 'rejected' then 'নাকচ' when 'needs_review' then 'পুনৰীক্ষণ প্ৰয়োজন' else 'আপডেট হ''ল' end;
    if new.user_id is not null then
      insert into notifications (user_id, complaint_id, title_en, title_as)
      values (new.user_id, new.id, new.code || ': ' || s_en, new.code || ': ' || s_as);
    end if;
  end if;
  return new;
end $$;
create trigger complaints_aw after insert or update on complaints for each row execute function complaints_after_write();

-- Me too: +1, priority bump at 5 and 10
create or replace function support_complaint(cid uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into complaint_supporters (complaint_id, user_id) values (cid, auth.uid()) on conflict do nothing;
  if not found then select metoo_count into n from complaints where id = cid; return n; end if;
  update complaints set metoo_count = metoo_count + 1,
    priority = case when metoo_count + 1 in (5, 10) then greatest(priority - 1, 1) else priority end
  where id = cid returning metoo_count into n;
  insert into complaint_events (complaint_id, actor_id, type) values (cid, auth.uid(), 'metoo');
  return n;
end $$;

-- ---------- RPCs used by API + agent tools ----------
create or replace function match_complaints(
  query_embedding vector(768), match_threshold real default 0.80, match_count int default 5,
  filter_location uuid default null, within_days int default 14
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
  order by c.embedding <=> query_embedding
  limit match_count
$$;

create or replace function dashboard_stats(dept uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', count(*) filter (where status in ('submitted','triaged','needs_review','assigned')),
    'in_progress', count(*) filter (where status = 'in_progress'),
    'resolved', count(*) filter (where status in ('resolved','closed')),
    'overdue', count(*) filter (where sla_due_at < now() and status not in ('resolved','closed','rejected','duplicate')),
    'contributors', count(distinct user_id),
    'avg_resolution_hours', round(extract(epoch from avg(resolved_at - created_at)) / 3600)::int,
    'by_lang', jsonb_build_object('en', count(*) filter (where original_lang = 'en'), 'as', count(*) filter (where original_lang = 'as'))
  )
  from complaints where parent_id is null and (dept is null or department_id = dept)
$$;

create or replace function trend_by_day(dept uuid default null, days int default 14)
returns table (day date, created bigint, resolved bigint)
language sql stable security definer set search_path = public as $$
  select d::date,
    (select count(*) from complaints c where c.created_at::date = d::date and (dept is null or c.department_id = dept)),
    (select count(*) from complaints c where c.resolved_at::date = d::date and (dept is null or c.department_id = dept))
  from generate_series(current_date - (days - 1), current_date, interval '1 day') d
$$;

create or replace function top_locations(dept uuid default null, days int default 7, lim int default 10)
returns table (location_id uuid, name_en text, name_as text, open_count bigint, total bigint)
language sql stable security definer set search_path = public as $$
  select l.id, l.name_en, l.name_as,
    count(*) filter (where c.status not in ('resolved','closed','rejected','duplicate')), count(*)
  from complaints c join locations l on l.id = c.location_id
  where c.created_at > now() - make_interval(days => days) and (dept is null or c.department_id = dept)
  group by l.id order by 4 desc, 5 desc limit lim
$$;

create or replace function category_breakdown(dept uuid default null, days int default 30)
returns table (category complaint_category, total bigint)
language sql stable security definer set search_path = public as $$
  select category, count(*) from complaints
  where created_at > now() - make_interval(days => days) and (dept is null or department_id = dept)
  group by 1 order by 2 desc
$$;

create or replace function department_load()
returns table (department_id uuid, name_en text, name_as text, open_count bigint, overdue bigint)
language sql stable security definer set search_path = public as $$
  select d.id, d.name_en, d.name_as,
    count(c.*) filter (where c.status not in ('resolved','closed','rejected','duplicate')),
    count(c.*) filter (where c.sla_due_at < now() and c.status not in ('resolved','closed','rejected','duplicate'))
  from departments d left join complaints c on c.department_id = d.id
  group by d.id order by 4 desc
$$;

create or replace function check_rate_limit(max_per_hour int default 5) returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) < max_per_hour from complaints where user_id = auth.uid() and created_at > now() - interval '1 hour'
$$;

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table departments enable row level security;
alter table locations enable row level security;
alter table complaints enable row level security;
alter table complaint_events enable row level security;
alter table complaint_supporters enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table ai_providers enable row level security;
alter table ai_keys enable row level security;
alter table ai_logs enable row level security;
alter table ai_cache enable row level security;
-- ai_* tables: no policies → only the service role (server code) can touch them.

create policy "profiles self read" on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles self update" on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = my_role());
create policy "super admin manages profiles" on profiles for all using (current_role_is('super_admin'));

create policy "departments readable" on departments for select using (true);
create policy "departments super admin" on departments for all using (current_role_is('super_admin'));
create policy "locations readable" on locations for select using (true);
create policy "locations super admin" on locations for all using (current_role_is('super_admin'));

create policy "complaints owner read" on complaints for select using (user_id = auth.uid());
create policy "complaints admin read" on complaints for select
  using (current_role_is('super_admin') or (current_role_is('dept_admin') and department_id = my_department()));
create policy "complaints insert own" on complaints for insert with check (user_id = auth.uid());
create policy "complaints admin update" on complaints for update
  using (current_role_is('super_admin') or (current_role_is('dept_admin') and department_id = my_department()));
create policy "complaints owner rate" on complaints for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "events visible with complaint" on complaint_events for select
  using (exists (select 1 from complaints c where c.id = complaint_id));
create policy "supporters own" on complaint_supporters for select using (user_id = auth.uid() or is_admin());

create policy "messages visible with complaint" on messages for select
  using (exists (select 1 from complaints c where c.id = complaint_id));
create policy "messages send" on messages for insert
  with check (sender_id = auth.uid() and exists (select 1 from complaints c where c.id = complaint_id));

create policy "notifications own" on notifications for select using (user_id = auth.uid());
create policy "notifications mark read" on notifications for update using (user_id = auth.uid());

-- anonymous complaints: admins read through this view, which hides the reporter
create view complaints_admin with (security_invoker = true) as
  select c.*, case when c.anonymous then null else c.user_id end as reporter_id
  from complaints c;

-- ---------- realtime ----------
alter publication supabase_realtime add table complaints, notifications, messages, complaint_events;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos', 'complaint-photos', false, 5242880, array['image/jpeg','image/png','image/webp']),
       ('resolution-photos', 'resolution-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own photos" on storage.objects for select to authenticated
  using (bucket_id in ('complaint-photos','resolution-photos') and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "admins upload resolution photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'resolution-photos' and is_admin());


-- Source: supabase/migrations/20261031000000_privacy_staff.sql
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


-- Source: supabase/migrations/20261031120000_app_config.sql
-- Migration 3: app config, failure simulation for the system panel, profile font size + onboarding flag.

-- ---------- app_config (key/value, readable by everyone, written by super admin) ----------
create table app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create or replace function app_config_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger app_config_touch before update on app_config for each row execute function app_config_touch();

alter table app_config enable row level security;
create policy "app config readable" on app_config for select to anon, authenticated using (true);
create policy "app config super admin" on app_config for all
  using (current_role_is('super_admin')) with check (current_role_is('super_admin'));
grant select on app_config to anon, authenticated;

-- TODO(Aman): replace the empty numbers with the real Dibrugarh University numbers before launch.
-- Shown to reporters when a complaint is urgent (PRD rule 5). We never claim to dispatch help.
insert into app_config (key, value) values
 ('campus_security', '{"phone": "", "label_en": "Campus security", "label_as": "কেম্পাছ সুৰক্ষা", "todo": true}'),
 ('campus_emergency', '{"phone": "", "label_en": "Campus emergency", "label_as": "কেম্পাছ জৰুৰীকালীন সেৱা", "todo": true}');

-- ---------- system panel: force a key to behave as rate-limited (live failover check) ----------
alter table ai_keys add column simulate_failure boolean not null default false;

-- ---------- profiles ----------
alter table profiles
  add column font_size text not null default 'normal' check (font_size in ('normal','large')),
  add column onboarded_at timestamptz; -- set by /onboarding; null ⇒ send the user through setup


-- Source: supabase/migrations/20261031180000_engine_config.sql
-- Migration 4: columns and config used by the Go backend engine (engine/).
-- Idempotent: app_config, ai_keys.simulate_failure and profiles.font_size already come from migration 3.

-- ---------- SLA alert worker: notify dept admins once per overdue complaint ----------
alter table complaints add column if not exists sla_alerted_at timestamptz;
create index if not exists complaints_sla_open on complaints (sla_due_at)
  where sla_alerted_at is null and status not in ('resolved','closed','rejected','duplicate');

-- ---------- failover test + profile prefs (no-ops after migration 3) ----------
alter table ai_keys add column if not exists simulate_failure boolean not null default false;
alter table profiles add column if not exists font_size text not null default 'normal' check (font_size in ('normal','large'));

-- ---------- app_config (key/value, readable by everyone, written by super admin) ----------
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
alter table app_config enable row level security;
drop policy if exists "app config readable" on app_config;
create policy "app config readable" on app_config for select to anon, authenticated using (true);
drop policy if exists "app config super admin" on app_config;
create policy "app config super admin" on app_config for all
  using (current_role_is('super_admin')) with check (current_role_is('super_admin'));
grant select on app_config to anon, authenticated;

-- TODO(Aman): real Dibrugarh University numbers before launch.
insert into app_config (key, value) values
 ('campus_security', '{"phone": "", "label_en": "Campus security", "label_as": "কেম্পাছ সুৰক্ষা", "todo": true}'),
 ('campus_emergency', '{"phone": "", "label_en": "Campus emergency", "label_as": "কেম্পাছ জৰুৰীকালীন সেৱা", "todo": true}'),
 ('demo_mode', 'false')
on conflict (key) do nothing;


-- Source: supabase/migrations/20261031200000_security_hardening.sql
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


-- Source: supabase/migrations/20261031220000_privacy_columns.sql
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


-- Source: supabase/migrations/20261031230000_remove_demo.sql
-- Migration: drop the leftover demo flag. Real auth only; there is no demo mode.
delete from app_config where key = 'demo_mode';


-- Source: supabase/migrations/20261031235000_profile_course.sql
-- Migration 8: students give their course/programme instead of choosing a department.
-- Departments are fixing units (Water & Sanitation, Electrical…); only staff belong to one.
alter table profiles add column if not exists course text check (course is null or char_length(course) <= 80);
comment on column profiles.course is 'Programme/course a student studies (profile info only; students never belong to a fixing department)';


-- Source: supabase/migrations/20261031240000_complaints_admin_view.sql
-- Migration 9: rebuild complaints_admin.
-- The original view (migration 1) used c.*, which froze the column list before migration 2 and also exposed
-- user_id — defeating its purpose of hiding anonymous reporters. Columns are now listed explicitly:
-- no user_id, no embedding; reporter_id is null for anonymous reports. security_invoker keeps admin RLS.
drop view if exists complaints_admin;
create view complaints_admin with (security_invoker = true) as
  select c.id, c.code, c.anonymous, c.original_text, c.original_lang,
         c.title_en, c.title_as, c.summary_en, c.summary_as, c.category, c.priority, c.status,
         c.location_id, c.location_note, c.department_id, c.parent_id, c.dup_score, c.metoo_count, c.image_urls,
         c.ai_status, c.ai_meta, c.sla_due_at, c.sla_alerted_at, c.resolved_at, c.rating, c.created_at, c.updated_at,
         c.visibility, c.is_sensitive, c.is_urgent, c.assignee_id,
         c.resolution_note_en, c.resolution_note_as, c.resolution_photo_url, c.verified_by_reporter,
         case when c.anonymous then null else c.user_id end as reporter_id
  from complaints c;
grant select on complaints_admin to authenticated;
revoke select on complaints_admin from anon;


-- Source: supabase/migrations/20261101000000_staff_skills_autoassign.sql
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


-- Source: supabase/migrations/20261101010000_security_privacy_hardening.sql
-- Migration 11: Security & Privacy Hardening
-- Enforces that any complaint flagged as sensitive automatically becomes private at the DB layer,
-- preventing any accidental or malicious leakage of sensitive complaints into public views.

create or replace function complaints_enforce_sensitive_privacy() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_sensitive then
    new.visibility := 'private';
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_sensitive_privacy on complaints;
create trigger complaints_sensitive_privacy
  before insert or update on complaints
  for each row execute function complaints_enforce_sensitive_privacy();


-- Source: supabase/migrations/20261101030000_review_fixes.sql
-- Migration 11: fixes from the external code review (verified against the code).
--  1. Sensitive reports are admins-only: field staff can't be assigned, can't read, aren't suggested.
--  2. Dept admins read only the profiles they need (their department + reporters of their tickets).
--  3. Anonymous reporters: the "created" timeline event no longer carries the reporter's id.
--  4. Shared rate limits (Postgres, not per-process memory) for AI preview, agent and chat.
--  5. Idempotent complaint submission (client_request_id).
--  6. SLA alert worker: notifications + marker written atomically in one function.
--  7. Append-only audit log for privileged actions.

-- ---------- 1. sensitive reports ----------
-- Field staff may never be the assignee of a sensitive report (admins may).
create or replace function complaints_sensitive_assignee() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_sensitive and new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.is_sensitive is distinct from old.is_sensitive)
     and exists (select 1 from profiles p where p.id = new.assignee_id and p.role = 'field_staff') then
    raise exception 'SENSITIVE_ADMINS_ONLY' using errcode = '42501',
      hint = 'Sensitive reports can only be handled by department admins';
  end if;
  return new;
end $$;
drop trigger if exists complaints_sensitive_assignee on complaints;
create trigger complaints_sensitive_assignee before insert or update on complaints
  for each row execute function complaints_sensitive_assignee();
revoke execute on function complaints_sensitive_assignee() from public, anon, authenticated;

-- An assignee only sees the ticket while it is not sensitive (an admin assignee still sees it via the admin policies).
drop policy if exists "complaints assignee read" on complaints;
create policy "complaints assignee read" on complaints for select
  using (assignee_id = auth.uid() and not is_sensitive);
drop policy if exists "complaints assignee update" on complaints;
create policy "complaints assignee update" on complaints for update
  using (assignee_id = auth.uid() and not is_sensitive) with check (assignee_id = auth.uid());

-- Staff suggestions skip sensitive reports.
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
  -- Sensitive reports are admins-only (PRD rule 4): never suggest field staff for them.
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

-- ---------- 2. profile visibility ----------
-- Before: any dept_admin could read every profile (is_admin()). Now: self, super admin, or a dept admin for
-- members of their own department and the (non-anonymous) reporters / assignees of their department's tickets.
create or replace function dept_admin_can_read_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_is('dept_admin') and my_department() is not null and (
    exists (select 1 from profiles p where p.id = pid and p.department_id = my_department())
    or exists (select 1 from complaints c where c.department_id = my_department()
               and ((c.user_id = pid and not c.anonymous) or c.assignee_id = pid))
  )
$$;
revoke execute on function dept_admin_can_read_profile(uuid) from public, anon;
grant execute on function dept_admin_can_read_profile(uuid) to authenticated;

drop policy if exists "profiles self read" on profiles;
create policy "profiles self read" on profiles for select
  using (id = auth.uid() or current_role_is('super_admin') or dept_admin_can_read_profile(id));

-- ---------- 3. anonymous reporters ----------
create or replace function complaint_events_mask_anonymous() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'created' and exists (select 1 from complaints c where c.id = new.complaint_id and c.anonymous) then
    new.actor_id := null;
  end if;
  return new;
end $$;
drop trigger if exists complaint_events_mask_anonymous on complaint_events;
create trigger complaint_events_mask_anonymous before insert on complaint_events
  for each row execute function complaint_events_mask_anonymous();
revoke execute on function complaint_events_mask_anonymous() from public, anon, authenticated;
update complaint_events e set actor_id = null
  from complaints c where c.id = e.complaint_id and c.anonymous and e.type = 'created' and e.actor_id is not null;

-- ---------- 4. shared rate limits ----------
create table if not exists rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bucket text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_lookup on rate_events (user_id, bucket, at desc);
alter table rate_events enable row level security; -- no policies: only the function below touches it

-- Atomically counts the caller's events in the window and records one more if allowed.
-- Returns 0 when allowed, otherwise the seconds until the oldest event leaves the window.
create or replace function hit_rate_limit(p_bucket text, p_max int, p_window_seconds int) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
  oldest timestamptz;
begin
  if uid is null then return p_window_seconds; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || p_bucket));
  select count(*), min(at) into n, oldest from rate_events
    where user_id = uid and bucket = p_bucket and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return greatest(1, ceil(extract(epoch from (oldest + make_interval(secs => p_window_seconds) - now())))::int);
  end if;
  insert into rate_events (user_id, bucket) values (uid, p_bucket);
  -- keep the table small
  delete from rate_events where user_id = uid and bucket = p_bucket and at < now() - interval '1 day';
  return 0;
end $$;
revoke execute on function hit_rate_limit(text, int, int) from public, anon;
grant execute on function hit_rate_limit(text, int, int) to authenticated;

-- ---------- 5. idempotent submission ----------
alter table complaints add column if not exists client_request_id uuid;
create unique index if not exists complaints_client_request
  on complaints (user_id, client_request_id) where client_request_id is not null;

-- ---------- 6. SLA alerts: one atomic step per complaint ----------
-- Claims the complaint (sla_alerted_at) and writes the dept-admin notifications in the same transaction,
-- so a crash can neither duplicate alerts nor lose the marker. Returns the number of notifications.
create or replace function sla_alert_complaint(cid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
begin
  update complaints set sla_alerted_at = now()
   where id = cid and sla_alerted_at is null and sla_due_at < now()
     and status not in ('resolved','closed','rejected','duplicate')
  returning id, code, department_id into c;
  if not found then return 0; end if;
  insert into notifications (user_id, complaint_id, title_en, title_as)
  select p.id, c.id, c.code || ' is overdue', c.code || ': সমাধানৰ সময়সীমা পাৰ হৈছে'
    from profiles p where p.role = 'dept_admin' and p.department_id = c.department_id and coalesce(p.active, true);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function sla_alert_complaint(uuid) from public, anon, authenticated;
grant execute on function sla_alert_complaint(uuid) to service_role;

-- ---------- 7. audit log ----------
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,          -- e.g. key.create, key.simulate_failure, model.update, member.role, department.update
  target text,                   -- e.g. ai_keys:<id>, profiles:<id>
  details jsonb not null default '{}', -- redacted: never secrets or complaint text
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_t on audit_logs (created_at desc);
alter table audit_logs enable row level security;
drop policy if exists "audit super admin read" on audit_logs;
create policy "audit super admin read" on audit_logs for select using (current_role_is('super_admin'));
-- Append-only: no update/delete for anyone through the API; inserts come from server code (service role).
revoke update, delete on audit_logs from anon, authenticated;


-- Source: supabase/migrations/20261101040000_revoke_rls_auto_enable.sql
-- Migration 12: Supabase's rls_auto_enable() is an event-trigger function (it turns RLS on for new tables);
-- it never needs to be callable through the API, but the advisor showed anon/authenticated could execute it.
-- Event triggers keep firing after this revoke.
do $optional_supabase_function$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$optional_supabase_function$;


-- Source: supabase/migrations/20261101050000_anonymous_owners.sql
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


-- Source: supabase/migrations/20261101060000_real_campus_locations.sql
-- Real Dibrugarh University places from the campus map kit (OpenStreetMap / Overture / reviewed public pins,
-- see public/campus/ATTRIBUTION.txt). map_x/map_y = local metres / map extent (3141.49 x 2357.16 m), so
-- x_m = map_x * 3141.49 and y_m = map_y * 2357.16 in public/campus/map-data.json. lat/lng are WGS84.
-- NOTE: name_as was written by hand (ৰ/ৱ, no Bengali ra); it still needs a native-speaker read before the demo.
-- Idempotent: the 10 seed placeholders are updated in place (their ids are referenced by complaints and
-- profiles.coverage_location_ids); every other campus place is inserted only if its name_en is new.

-- Pixel character avatar (0-59 in /campus/team-characters.webp); null = derived from the user id in the app.
alter table profiles add column if not exists avatar_character smallint
  check (avatar_character between 0 and 59);

update locations l set name_en = v.name_en, name_as = v.name_as, type = v.type, lat = v.lat, lng = v.lng, map_x = v.map_x, map_y = v.map_y
from (values
 ('64c66c1d-6708-4ed3-849c-79fa40512d71'::uuid, 'Administrative Building', 'প্ৰশাসনিক ভৱন', 'admin', 27.4492486, 94.8972003, 0.603986, 0.50055),
 ('55a635e4-7d7b-4092-a160-3af42d70d565'::uuid, 'Aideu Handique Girls Hostel', 'আইদেউ হেণ্ডিক ছোৱালী হোষ্টেল', 'hostel', 27.446639, 94.8995632, 0.679743, 0.621704),
 ('e59e8be5-2b3a-4a24-824e-d3fac2bacb06'::uuid, 'Bulbuli Canteen', 'বুলবুলি কেণ্টিন', 'food', 27.4490327, 94.8957407, 0.558174, 0.511633),
 ('aea07b88-b6f5-413b-a801-3a1d51d66753'::uuid, 'Centre for Computer Science and Applications', 'কম্পিউটাৰ বিজ্ঞান আৰু প্ৰয়োগ কেন্দ্ৰ', 'academic', 27.4494496, 94.8949523, 0.533142, 0.492541),
 ('884f5be8-89d8-4acb-82a7-e8a1caf02dac'::uuid, 'Department of Chemistry', 'ৰসায়ন বিজ্ঞান বিভাগ', 'academic', 27.448067, 94.8953513, 0.546441, 0.557276),
 ('9862134f-eb63-475d-bef4-867001d1ab55'::uuid, 'Dibrugarh University Residential Campus Gate', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় আৱাসিক চৌহদৰ দুৱাৰ', 'gate', 27.4519703, 94.8887219, 0.335748, 0.37803),
 ('ef6c1368-93df-4136-a108-f39b4630e55d'::uuid, 'DU New Playground', 'ডি.ইউ. নতুন খেলপথাৰ', 'sports', 27.449001, 94.9009554, 0.722276, 0.509782),
 ('6a6c7176-c451-4f67-8399-253e81eb0839'::uuid, 'Lakshminath Bezbaroa Library', 'লক্ষ্মীনাথ বেজবৰুৱা পুথিভঁৰাল', 'academic', 27.4480527, 94.8963403, 0.577569, 0.557316),
 ('4a454d20-38f5-4ac3-bd71-03c4b952e60a'::uuid, 'Padmanath Gohain Baruah Chatra Nivas (PNGBCN)', 'পদ্মনাথ গোহাঞিবৰুৱা ছাত্ৰ নিৱাস (PNGBCN)', 'hostel', 27.4514408, 94.8992517, 0.667352, 0.396189),
 ('5aa5addd-ce95-4433-8fb4-29f4a510f5f3'::uuid, 'Rangghar Auditorium', 'ৰংঘৰ প্ৰেক্ষাগৃহ', 'event', 27.4496013, 94.8962796, 0.574825, 0.48456)
) as v(id, name_en, name_as, type, lat, lng, map_x, map_y)
where l.id = v.id;

insert into locations (name_en, name_as, type, lat, lng, map_x, map_y)
select v.name_en, v.name_as, v.type, v.lat, v.lng, v.map_x, v.map_y from (values
 ('Activity Centre, D.U.', 'ডি.ইউ. কাৰ্যকলাপ কেন্দ্ৰ', 'event', 27.4491923, 94.8938271, 0.497876, 0.505355),
 ('Ankuran Day Care Centre', 'অংকুৰণ শিশু পৰিচৰ্যা কেন্দ্ৰ', 'other', 27.4504565, 94.8922175, 0.446549, 0.446958),
 ('APDCN (Amal Prabha Das Chatri Nivas)', 'অমলপ্ৰভা দাস ছাত্ৰী নিৱাস (APDCN)', 'hostel', 27.4483213, 94.8886789, 0.336351, 0.549583),
 ('Bhimbor Deori Indoor Stadium', 'ভীমবৰ দেউৰী ইনড''ৰ ষ্টেডিয়াম', 'sports', 27.4499837, 94.8980312, 0.629734, 0.465464),
 ('Central Sophisticated Instrumentation Centre', 'কেন্দ্ৰীয় উন্নত যন্ত্ৰপাতি কেন্দ্ৰ', 'academic', 27.451733, 94.89144, 0.4214, 0.387451),
 ('Centre for Atmospheric Studies', 'বায়ুমণ্ডলীয় অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4474767, 94.8943448, 0.515088, 0.585668),
 ('Centre for Biotechnology and Bioinformatics', 'জৈৱপ্ৰযুক্তি আৰু জৈৱ-তথ্যবিজ্ঞান কেন্দ্ৰ', 'academic', 27.450697, 94.8944905, 0.517941, 0.4342),
 ('Centre for Distance and Online Education', 'দূৰ আৰু অনলাইন শিক্ষা কেন্দ্ৰ', 'academic', 27.4482976, 94.8926527, 0.461403, 0.548162),
 ('Centre for Juridical Studies', 'আইন অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4486367, 94.8921843, 0.446482, 0.532521),
 ('Centre for Library and Information Science Studies', 'পুথিভঁৰাল আৰু তথ্য বিজ্ঞান অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4479825, 94.8964587, 0.581332, 0.56054),
 ('Centre for Management Studies', 'ব্যৱস্থাপনা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4522657, 94.8962116, 0.571251, 0.35936),
 ('Centre for Social Work Studies', 'সমাজকৰ্ম অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4514339, 94.8971997, 0.60279, 0.397828),
 ('Centre for Studies in Journalism and Mass Communication', 'সাংবাদিকতা আৰু গণসংযোগ অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4494674, 94.8944668, 0.517856, 0.492014),
 ('Centre for Studies in Philosophy', 'দৰ্শন অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4504511, 94.8954013, 0.546732, 0.445176),
 ('Centre for Tea and Agro Studies', 'চাহ আৰু কৃষি অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4486889, 94.8928622, 0.467785, 0.529634),
 ('China Gate', 'চায়না দুৱাৰ', 'gate', 27.4532856, 94.8954858, 0.547865, 0.311883),
 ('Dean''s Office', 'ডীনৰ কাৰ্যালয়', 'admin', 27.4485109, 94.8982481, 0.637353, 0.534556),
 ('Department of Anthropology', 'নৃতত্ত্ব বিভাগ', 'academic', 27.4491548, 94.8952622, 0.543052, 0.5062),
 ('Department of Applied Geology', 'প্ৰয়োগিক ভূতত্ত্ব বিভাগ', 'academic', 27.4491438, 94.8930597, 0.473755, 0.508125),
 ('Department of Applied Psychology', 'প্ৰয়োগিক মনোবিজ্ঞান বিভাগ', 'academic', 27.4493409, 94.8945219, 0.519658, 0.497925),
 ('Department of Assamese', 'অসমীয়া বিভাগ', 'academic', 27.451347, 94.8961637, 0.570239, 0.402576),
 ('Department of Bodo', 'বড়ো বিভাগ', 'academic', 27.4519343, 94.8972712, 0.60477, 0.37426),
 ('Department of Commerce', 'বাণিজ্য বিভাগ', 'academic', 27.4515957, 94.8964489, 0.579079, 0.390703),
 ('Department of Computer Science and Engineering, DUIET', 'কম্পিউটাৰ বিজ্ঞান আৰু অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4518772, 94.8913756, 0.419296, 0.380714),
 ('Department of Economics', 'অৰ্থনীতি বিভাগ', 'academic', 27.451618, 94.8966877, 0.58658, 0.389502),
 ('Department of Education', 'শিক্ষা বিভাগ', 'academic', 27.4510732, 94.8928803, 0.467073, 0.417546),
 ('Department of Electronics and Communication Engineering, DUIET', 'ইলেক্ট্ৰনিক্স আৰু সংযোগ অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4517885, 94.8909662, 0.406462, 0.385144),
 ('Department of English', 'ইংৰাজী বিভাগ', 'academic', 27.4507933, 94.8965003, 0.581128, 0.428388),
 ('Department of Geography', 'ভূগোল বিভাগ', 'academic', 27.450837, 94.8968379, 0.591727, 0.426117),
 ('Department of History', 'ইতিহাস বিভাগ', 'academic', 27.4513626, 94.8961887, 0.571017, 0.401826),
 ('Department of Life Sciences', 'জীৱ বিজ্ঞান বিভাগ', 'academic', 27.4508075, 94.8944118, 0.515405, 0.429056),
 ('Department of Mathematics', 'গণিত বিভাগ', 'academic', 27.4496371, 94.894834, 0.529319, 0.483802),
 ('Department of Petroleum Engineering, DUIET', 'পেট্ৰ''লিয়াম অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4508528, 94.8909022, 0.40495, 0.429169),
 ('Department of Petroleum Technology', 'পেট্ৰ''লিয়াম প্ৰযুক্তি বিভাগ', 'academic', 27.4497189, 94.8921832, 0.445866, 0.481651),
 ('Department of Pharmaceutical Sciences', 'ঔষধ বিজ্ঞান বিভাগ', 'academic', 27.4504003, 94.8912331, 0.415605, 0.450228),
 ('Department of Physics', 'পদাৰ্থ বিজ্ঞান বিভাগ', 'academic', 27.4478965, 94.8945959, 0.522763, 0.565774),
 ('Department of Political Science', 'ৰাজনীতি বিজ্ঞান বিভাগ', 'academic', 27.450873, 94.8965529, 0.58274, 0.424608),
 ('Department of Sociology', 'সমাজতত্ত্ব বিভাগ', 'academic', 27.451236, 94.8970337, 0.597673, 0.407236),
 ('Department of Statistics', 'পৰিসংখ্যা বিজ্ঞান বিভাগ', 'academic', 27.4496901, 94.8951203, 0.538299, 0.481128),
 ('Dibrugarh University Institute of Engineering and Technology (DUIET)', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় অভিযান্ত্ৰিক আৰু প্ৰযুক্তি প্ৰতিষ্ঠান (DUIET)', 'academic', 27.4513607, 94.8898846, 0.372659, 0.405944),
 ('Dibrugarh University Old Park', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় পুৰণি উদ্যান', 'sports', 27.4492194, 94.8917665, 0.433023, 0.505397),
 ('Dibrugarh University Post Office', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় ডাকঘৰ', 'other', 27.4489063, 94.8923676, 0.452105, 0.519731),
 ('Dibrugarh University Tea Estate', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় চাহ বাগিচা', 'other', 27.4520194, 94.8842335, 0.194495, 0.37858),
 ('Dr. Bhupen Hazarika Centre for Studies in Performing Arts', 'ড° ভূপেন হাজৰিকা পৰিৱেশ্য কলা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.452923, 94.8959162, 0.561603, 0.328652),
 ('DU Gymnasium', 'ডি.ইউ. ব্যায়ামাগাৰ', 'sports', 27.4499227, 94.898514, 0.644959, 0.468022),
 ('DU Haat', 'ডি.ইউ. হাট', 'food', 27.4473019, 94.892023, 0.442124, 0.595368),
 ('DU Health Centre', 'ডি.ইউ. স্বাস্থ্য কেন্দ্ৰ', 'health', 27.446934, 94.8986363, 0.650418, 0.608431),
 ('DU Model School', 'ডি.ইউ. আৰ্হি বিদ্যালয়', 'other', 27.4472389, 94.8910001, 0.409971, 0.598982),
 ('DU Park', 'ডি.ইউ. উদ্যান', 'sports', 27.4458108, 94.8979524, 0.629503, 0.661667),
 ('DUIET Cafeteria', 'DUIET কেণ্টিন', 'food', 27.4514407, 94.8915479, 0.424952, 0.401122),
 ('DUPGSU Office', 'DUPGSU কাৰ্যালয়', 'admin', 27.448926, 94.8981616, 0.634407, 0.515099),
 ('DUTA House', 'DUTA ভৱন', 'other', 27.4463449, 94.8962388, 0.575294, 0.637658),
 ('Guruprasad Das Chatra Nivas (GPDCN)', 'গুৰুপ্ৰসাদ দাস ছাত্ৰ নিৱাস (GPDCN)', 'hostel', 27.4522559, 94.8931241, 0.474109, 0.361795),
 ('JO SAG', 'জ'' ছাগ', 'food', 27.4477963, 94.8981465, 0.634541, 0.568211),
 ('Joymati Chatri Nibash Gate', 'জয়মতী ছাত্ৰী নিৱাস দুৱাৰ', 'gate', 27.4467489, 94.900584, 0.711805, 0.615883),
 ('Juti Canteen', 'জুতি কেণ্টিন', 'food', 27.4513878, 94.8966793, 0.58644, 0.400328),
 ('Lummer Dai Chatra Nivas (LDCN)', 'লুম্মেৰ দাই ছাত্ৰ নিৱাস (LDCN)', 'hostel', 27.4516957, 94.8931221, 0.474347, 0.38813),
 ('Maffizzudin Ahmed Hazarika Chatra Nivas', 'মফিজুদ্দিন আহমেদ হাজৰিকা ছাত্ৰ নিৱাস', 'hostel', 27.452223, 94.898845, 0.654134, 0.359681),
 ('Miles Bronson Chatra Niwas', 'মাইলছ ব্ৰনছন ছাত্ৰ নিৱাস', 'hostel', 27.4536028, 94.8983178, 0.636802, 0.295159),
 ('Nalinibala Devi Chatri Nivas', 'নলিনীবালা দেৱী ছাত্ৰী নিৱাস', 'hostel', 27.4473557, 94.9013258, 0.734819, 0.586884),
 ('Padmakumari Gohain Women''s Hostel', 'পদ্মকুমাৰী গোহাঞি মহিলা হোষ্টেল', 'hostel', 27.4470096, 94.9002212, 0.700248, 0.603862),
 ('Pavilion Play Ground No. 1', 'পেভিলিয়ন খেলপথাৰ নং ১', 'sports', 27.4497852, 94.8930308, 0.472501, 0.477994),
 ('Punjab National Bank', 'পাঞ্জাব নেচনেল বেংক', 'other', 27.4506061, 94.8940709, 0.504787, 0.438741),
 ('Puspalata Das Chatri Nivas (PDCN)', 'পুষ্পলতা দাস ছাত্ৰী নিৱাস (PDCN)', 'hostel', 27.4475386, 94.9016076, 0.743588, 0.578106),
 ('SBI ATM (near Post Office)', 'SBI এ.টি.এম. (ডাকঘৰৰ ওচৰত)', 'other', 27.4489596, 94.8920596, 0.442385, 0.517422),
 ('SBI ATM (near Administrative Building)', 'SBI এ.টি.এম. (প্ৰশাসনিক ভৱনৰ ওচৰত)', 'other', 27.4495, 94.8979, 0.625867, 0.488285),
 ('SBI Branch, Dibrugarh University', 'SBI শাখা, ডিব্ৰুগড় বিশ্ববিদ্যালয়', 'other', 27.4514665, 94.890255, 0.384257, 0.400734),
 ('Swarnalata Baruah Chatri Nivas (SLBCN)', 'স্বৰ্ণলতা বৰুৱা ছাত্ৰী নিৱাস (SLBCN)', 'hostel', 27.4470745, 94.9010056, 0.724895, 0.600308),
 ('UGC''s Centre for Women''s Studies', 'ইউ.জি.চি. মহিলা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4508791, 94.895216, 0.540671, 0.425176),
 ('University Park', 'বিশ্ববিদ্যালয় উদ্যান', 'sports', 27.4463568, 94.8978904, 0.627258, 0.636041),
 ('University Science Instrumentation Centre', 'বিশ্ববিদ্যালয় বিজ্ঞান যন্ত্ৰপাতি কেন্দ্ৰ', 'academic', 27.4478171, 94.8939934, 0.503848, 0.569891),
 ('Vice-Chancellor''s Office', 'উপাচাৰ্যৰ কাৰ্যালয়', 'admin', 27.4496373, 94.8973141, 0.607357, 0.482206),
 ('Vishranta Guest House', 'বিশ্ৰান্ত অতিথিশালা', 'other', 27.4459063, 94.8962703, 0.576521, 0.658255)
) as v(name_en, name_as, type, lat, lng, map_x, map_y)
where not exists (select 1 from locations l where l.name_en = v.name_en);


-- Source: supabase/migrations/20261101070000_notification_fanout.sql
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


-- Source: supabase/migrations/20261101080000_emergency_auto_assign.sql
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


-- Source: supabase/migrations/20261101090000_rag_search.sql
-- Migration 17: retrieval for Ask CivicSense (RAG). Finds past tickets by meaning (pgvector on the English
-- summary embedding, which is cross-lingual), including how they were resolved, so the agent can ground an
-- answer like "how did we fix the library leak last time?" in real tickets and cite their codes.
-- security invoker: the caller's RLS still applies (dept admins see their department only); `dept` narrows
-- further. Sensitive reports are never retrieved, since the text goes to an external model.

create or replace function rag_search(query_embedding vector, dept uuid default null, match_count int default 6,
                                      match_threshold real default 0.55)
returns table (code text, title_en text, title_as text, summary_en text, summary_as text, category complaint_category,
               status complaint_status, location_en text, location_as text, resolution_note_en text,
               resolution_note_as text, created_at timestamptz, resolved_at timestamptz, similarity real)
language sql stable security invoker set search_path = public as $$
  select c.code, c.title_en, c.title_as, c.summary_en, c.summary_as, c.category, c.status,
         l.name_en, l.name_as, c.resolution_note_en, c.resolution_note_as, c.created_at, c.resolved_at,
         (1 - (c.embedding <=> query_embedding))::real as similarity
  from complaints c
  left join locations l on l.id = c.location_id
  where c.embedding is not null
    and not c.is_sensitive
    and c.parent_id is null
    and (dept is null or c.department_id = dept)
    and 1 - (c.embedding <=> query_embedding) >= match_threshold
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 10)
$$;
revoke execute on function rag_search(vector, uuid, int, real) from public, anon;
grant execute on function rag_search(vector, uuid, int, real) to authenticated, service_role;


-- Source: supabase/migrations/20261101100000_assignment_workflow.sql
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


-- Source: supabase/migrations/20261101110000_notification_queue.sql
-- Migration 19: email delivery for notifications through Supabase Queues (pgmq).
-- Every notification row is enqueued on `notification_email`. The Go engine worker reads a batch with a
-- visibility timeout, emails each one (Resend) and deletes the message; if sending fails the message becomes
-- visible again after the timeout and is retried, and after 6 attempts it is archived (pgmq.a_notification_email)
-- so nothing is lost silently. The in-app notification itself is written as before.

create extension if not exists pgmq;
select pgmq.create('notification_email')
where not exists (select 1 from pgmq.list_queues() where queue_name = 'notification_email');

alter table profiles add column if not exists notify_email boolean not null default true;

create or replace function notifications_enqueue_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pgmq.send('notification_email', jsonb_build_object('notification_id', new.id));
  return null;
exception when others then
  -- Delivery is best effort; never block the notification itself.
  raise warning 'notification_email enqueue failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function notifications_enqueue_email() from public, anon, authenticated;
drop trigger if exists notifications_enqueue_email on notifications;
create trigger notifications_enqueue_email after insert on notifications for each row execute function notifications_enqueue_email();

-- Worker API (service role only). Read hides each message for `vt` seconds; the rows carry what the email needs.
create or replace function notification_queue_read(qty int default 20, vt int default 300)
returns table (msg_id bigint, read_ct int, notification_id bigint, email text, lang text, title_en text, title_as text,
               complaint_id uuid, already_read boolean, wants_email boolean)
language sql security definer set search_path = public, pgmq as $$
  select m.msg_id, m.read_ct, n.id, u.email::text, coalesce(p.lang_pref, 'en'), n.title_en, n.title_as,
         n.complaint_id, coalesce(n.read, false), coalesce(p.notify_email, true) and coalesce(p.active, true)
  from pgmq.read('notification_email', vt, least(greatest(qty, 1), 100)) m
  left join notifications n on n.id = (m.message ->> 'notification_id')::bigint
  left join profiles p on p.id = n.user_id
  left join auth.users u on u.id = n.user_id
$$;

create or replace function notification_queue_ack(ids bigint[]) returns int
language sql security definer set search_path = public, pgmq as $$
  select count(*)::int from unnest(ids) i where pgmq.delete('notification_email', i)
$$;

create or replace function notification_queue_dead(ids bigint[]) returns int
language sql security definer set search_path = public, pgmq as $$
  select count(*)::int from unnest(ids) i where pgmq.archive('notification_email', i)
$$;

create or replace function notification_queue_stats() returns jsonb
language sql security definer set search_path = public, pgmq as $$
  select jsonb_build_object(
    'queued', (select count(*) from pgmq.q_notification_email),
    'retrying', (select count(*) from pgmq.q_notification_email where read_ct > 0),
    'dead', (select count(*) from pgmq.a_notification_email))
$$;

revoke execute on function notification_queue_read(int, int) from public, anon, authenticated;
revoke execute on function notification_queue_ack(bigint[]) from public, anon, authenticated;
revoke execute on function notification_queue_dead(bigint[]) from public, anon, authenticated;
revoke execute on function notification_queue_stats() from public, anon, authenticated;
grant execute on function notification_queue_read(int, int), notification_queue_ack(bigint[]),
  notification_queue_dead(bigint[]), notification_queue_stats() to service_role;


-- Source: supabase/migrations/20261101130000_report_video_uploads.sql
alter table complaints add column if not exists video_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-videos', 'complaint-videos', false, 41943040, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "upload own complaint videos" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own complaint videos" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-videos' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- Source: supabase/seed.sql
-- Departments (routing targets). Aman: confirm names + SLA hours with real DU offices.
insert into departments (name_en, name_as, categories) values
 ('Estate & Maintenance', 'এষ্টেট আৰু ৰক্ষণাবেক্ষণ', '{plumbing,infrastructure}'),
 ('Electrical Section', 'বৈদ্যুতিক শাখা', '{electrical}'),
 ('Water & Sanitation', 'পানী আৰু চাফাই', '{water_supply,sanitation}'),
 ('Hostel Administration', 'হোষ্টেল প্ৰশাসন', '{hostel,mess_food}'),
 ('IT Cell', 'আইটি চেল', '{it_network}'),
 ('Academic Section', 'শৈক্ষিক শাখা', '{academic}'),
 ('Security Office', 'সুৰক্ষা কাৰ্যালয়', '{safety_security}'),
 ('Transport Section', 'পৰিবহণ শাখা', '{transport,other}');

-- Locations: the 83 real campus places from the Dibrugarh University map kit (see migration
-- 20261101060000_real_campus_locations.sql). map_x/map_y = local metres / map extent. name_as needs a native-speaker read.
-- Skips names the migration already inserted, so migrations + seed never duplicate a place.
insert into locations (name_en, name_as, type, lat, lng, map_x, map_y)
select v.name_en, v.name_as, v.type, v.lat, v.lng, v.map_x, v.map_y from (values
 ('Activity Centre, D.U.', 'ডি.ইউ. কাৰ্যকলাপ কেন্দ্ৰ', 'event', 27.4491923, 94.8938271, 0.497876, 0.505355),
 ('Administrative Building', 'প্ৰশাসনিক ভৱন', 'admin', 27.4492486, 94.8972003, 0.603986, 0.50055),
 ('Aideu Handique Girls Hostel', 'আইদেউ হেণ্ডিক ছোৱালী হোষ্টেল', 'hostel', 27.446639, 94.8995632, 0.679743, 0.621704),
 ('Ankuran Day Care Centre', 'অংকুৰণ শিশু পৰিচৰ্যা কেন্দ্ৰ', 'other', 27.4504565, 94.8922175, 0.446549, 0.446958),
 ('APDCN (Amal Prabha Das Chatri Nivas)', 'অমলপ্ৰভা দাস ছাত্ৰী নিৱাস (APDCN)', 'hostel', 27.4483213, 94.8886789, 0.336351, 0.549583),
 ('Bhimbor Deori Indoor Stadium', 'ভীমবৰ দেউৰী ইনড''ৰ ষ্টেডিয়াম', 'sports', 27.4499837, 94.8980312, 0.629734, 0.465464),
 ('Bulbuli Canteen', 'বুলবুলি কেণ্টিন', 'food', 27.4490327, 94.8957407, 0.558174, 0.511633),
 ('Central Sophisticated Instrumentation Centre', 'কেন্দ্ৰীয় উন্নত যন্ত্ৰপাতি কেন্দ্ৰ', 'academic', 27.451733, 94.89144, 0.4214, 0.387451),
 ('Centre for Atmospheric Studies', 'বায়ুমণ্ডলীয় অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4474767, 94.8943448, 0.515088, 0.585668),
 ('Centre for Biotechnology and Bioinformatics', 'জৈৱপ্ৰযুক্তি আৰু জৈৱ-তথ্যবিজ্ঞান কেন্দ্ৰ', 'academic', 27.450697, 94.8944905, 0.517941, 0.4342),
 ('Centre for Computer Science and Applications', 'কম্পিউটাৰ বিজ্ঞান আৰু প্ৰয়োগ কেন্দ্ৰ', 'academic', 27.4494496, 94.8949523, 0.533142, 0.492541),
 ('Centre for Distance and Online Education', 'দূৰ আৰু অনলাইন শিক্ষা কেন্দ্ৰ', 'academic', 27.4482976, 94.8926527, 0.461403, 0.548162),
 ('Centre for Juridical Studies', 'আইন অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4486367, 94.8921843, 0.446482, 0.532521),
 ('Centre for Library and Information Science Studies', 'পুথিভঁৰাল আৰু তথ্য বিজ্ঞান অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4479825, 94.8964587, 0.581332, 0.56054),
 ('Centre for Management Studies', 'ব্যৱস্থাপনা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4522657, 94.8962116, 0.571251, 0.35936),
 ('Centre for Social Work Studies', 'সমাজকৰ্ম অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4514339, 94.8971997, 0.60279, 0.397828),
 ('Centre for Studies in Journalism and Mass Communication', 'সাংবাদিকতা আৰু গণসংযোগ অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4494674, 94.8944668, 0.517856, 0.492014),
 ('Centre for Studies in Philosophy', 'দৰ্শন অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4504511, 94.8954013, 0.546732, 0.445176),
 ('Centre for Tea and Agro Studies', 'চাহ আৰু কৃষি অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4486889, 94.8928622, 0.467785, 0.529634),
 ('China Gate', 'চায়না দুৱাৰ', 'gate', 27.4532856, 94.8954858, 0.547865, 0.311883),
 ('Dean''s Office', 'ডীনৰ কাৰ্যালয়', 'admin', 27.4485109, 94.8982481, 0.637353, 0.534556),
 ('Department of Anthropology', 'নৃতত্ত্ব বিভাগ', 'academic', 27.4491548, 94.8952622, 0.543052, 0.5062),
 ('Department of Applied Geology', 'প্ৰয়োগিক ভূতত্ত্ব বিভাগ', 'academic', 27.4491438, 94.8930597, 0.473755, 0.508125),
 ('Department of Applied Psychology', 'প্ৰয়োগিক মনোবিজ্ঞান বিভাগ', 'academic', 27.4493409, 94.8945219, 0.519658, 0.497925),
 ('Department of Assamese', 'অসমীয়া বিভাগ', 'academic', 27.451347, 94.8961637, 0.570239, 0.402576),
 ('Department of Bodo', 'বড়ো বিভাগ', 'academic', 27.4519343, 94.8972712, 0.60477, 0.37426),
 ('Department of Chemistry', 'ৰসায়ন বিজ্ঞান বিভাগ', 'academic', 27.448067, 94.8953513, 0.546441, 0.557276),
 ('Department of Commerce', 'বাণিজ্য বিভাগ', 'academic', 27.4515957, 94.8964489, 0.579079, 0.390703),
 ('Department of Computer Science and Engineering, DUIET', 'কম্পিউটাৰ বিজ্ঞান আৰু অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4518772, 94.8913756, 0.419296, 0.380714),
 ('Department of Economics', 'অৰ্থনীতি বিভাগ', 'academic', 27.451618, 94.8966877, 0.58658, 0.389502),
 ('Department of Education', 'শিক্ষা বিভাগ', 'academic', 27.4510732, 94.8928803, 0.467073, 0.417546),
 ('Department of Electronics and Communication Engineering, DUIET', 'ইলেক্ট্ৰনিক্স আৰু সংযোগ অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4517885, 94.8909662, 0.406462, 0.385144),
 ('Department of English', 'ইংৰাজী বিভাগ', 'academic', 27.4507933, 94.8965003, 0.581128, 0.428388),
 ('Department of Geography', 'ভূগোল বিভাগ', 'academic', 27.450837, 94.8968379, 0.591727, 0.426117),
 ('Department of History', 'ইতিহাস বিভাগ', 'academic', 27.4513626, 94.8961887, 0.571017, 0.401826),
 ('Department of Life Sciences', 'জীৱ বিজ্ঞান বিভাগ', 'academic', 27.4508075, 94.8944118, 0.515405, 0.429056),
 ('Department of Mathematics', 'গণিত বিভাগ', 'academic', 27.4496371, 94.894834, 0.529319, 0.483802),
 ('Department of Petroleum Engineering, DUIET', 'পেট্ৰ''লিয়াম অভিযান্ত্ৰিক বিভাগ, DUIET', 'academic', 27.4508528, 94.8909022, 0.40495, 0.429169),
 ('Department of Petroleum Technology', 'পেট্ৰ''লিয়াম প্ৰযুক্তি বিভাগ', 'academic', 27.4497189, 94.8921832, 0.445866, 0.481651),
 ('Department of Pharmaceutical Sciences', 'ঔষধ বিজ্ঞান বিভাগ', 'academic', 27.4504003, 94.8912331, 0.415605, 0.450228),
 ('Department of Physics', 'পদাৰ্থ বিজ্ঞান বিভাগ', 'academic', 27.4478965, 94.8945959, 0.522763, 0.565774),
 ('Department of Political Science', 'ৰাজনীতি বিজ্ঞান বিভাগ', 'academic', 27.450873, 94.8965529, 0.58274, 0.424608),
 ('Department of Sociology', 'সমাজতত্ত্ব বিভাগ', 'academic', 27.451236, 94.8970337, 0.597673, 0.407236),
 ('Department of Statistics', 'পৰিসংখ্যা বিজ্ঞান বিভাগ', 'academic', 27.4496901, 94.8951203, 0.538299, 0.481128),
 ('Dibrugarh University Institute of Engineering and Technology (DUIET)', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় অভিযান্ত্ৰিক আৰু প্ৰযুক্তি প্ৰতিষ্ঠান (DUIET)', 'academic', 27.4513607, 94.8898846, 0.372659, 0.405944),
 ('Dibrugarh University Old Park', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় পুৰণি উদ্যান', 'sports', 27.4492194, 94.8917665, 0.433023, 0.505397),
 ('Dibrugarh University Post Office', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় ডাকঘৰ', 'other', 27.4489063, 94.8923676, 0.452105, 0.519731),
 ('Dibrugarh University Residential Campus Gate', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় আৱাসিক চৌহদৰ দুৱাৰ', 'gate', 27.4519703, 94.8887219, 0.335748, 0.37803),
 ('Dibrugarh University Tea Estate', 'ডিব্ৰুগড় বিশ্ববিদ্যালয় চাহ বাগিচা', 'other', 27.4520194, 94.8842335, 0.194495, 0.37858),
 ('Dr. Bhupen Hazarika Centre for Studies in Performing Arts', 'ড° ভূপেন হাজৰিকা পৰিৱেশ্য কলা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.452923, 94.8959162, 0.561603, 0.328652),
 ('DU Gymnasium', 'ডি.ইউ. ব্যায়ামাগাৰ', 'sports', 27.4499227, 94.898514, 0.644959, 0.468022),
 ('DU Haat', 'ডি.ইউ. হাট', 'food', 27.4473019, 94.892023, 0.442124, 0.595368),
 ('DU Health Centre', 'ডি.ইউ. স্বাস্থ্য কেন্দ্ৰ', 'health', 27.446934, 94.8986363, 0.650418, 0.608431),
 ('DU Model School', 'ডি.ইউ. আৰ্হি বিদ্যালয়', 'other', 27.4472389, 94.8910001, 0.409971, 0.598982),
 ('DU New Playground', 'ডি.ইউ. নতুন খেলপথাৰ', 'sports', 27.449001, 94.9009554, 0.722276, 0.509782),
 ('DU Park', 'ডি.ইউ. উদ্যান', 'sports', 27.4458108, 94.8979524, 0.629503, 0.661667),
 ('DUIET Cafeteria', 'DUIET কেণ্টিন', 'food', 27.4514407, 94.8915479, 0.424952, 0.401122),
 ('DUPGSU Office', 'DUPGSU কাৰ্যালয়', 'admin', 27.448926, 94.8981616, 0.634407, 0.515099),
 ('DUTA House', 'DUTA ভৱন', 'other', 27.4463449, 94.8962388, 0.575294, 0.637658),
 ('Guruprasad Das Chatra Nivas (GPDCN)', 'গুৰুপ্ৰসাদ দাস ছাত্ৰ নিৱাস (GPDCN)', 'hostel', 27.4522559, 94.8931241, 0.474109, 0.361795),
 ('JO SAG', 'জ'' ছাগ', 'food', 27.4477963, 94.8981465, 0.634541, 0.568211),
 ('Joymati Chatri Nibash Gate', 'জয়মতী ছাত্ৰী নিৱাস দুৱাৰ', 'gate', 27.4467489, 94.900584, 0.711805, 0.615883),
 ('Juti Canteen', 'জুতি কেণ্টিন', 'food', 27.4513878, 94.8966793, 0.58644, 0.400328),
 ('Lakshminath Bezbaroa Library', 'লক্ষ্মীনাথ বেজবৰুৱা পুথিভঁৰাল', 'academic', 27.4480527, 94.8963403, 0.577569, 0.557316),
 ('Lummer Dai Chatra Nivas (LDCN)', 'লুম্মেৰ দাই ছাত্ৰ নিৱাস (LDCN)', 'hostel', 27.4516957, 94.8931221, 0.474347, 0.38813),
 ('Maffizzudin Ahmed Hazarika Chatra Nivas', 'মফিজুদ্দিন আহমেদ হাজৰিকা ছাত্ৰ নিৱাস', 'hostel', 27.452223, 94.898845, 0.654134, 0.359681),
 ('Miles Bronson Chatra Niwas', 'মাইলছ ব্ৰনছন ছাত্ৰ নিৱাস', 'hostel', 27.4536028, 94.8983178, 0.636802, 0.295159),
 ('Nalinibala Devi Chatri Nivas', 'নলিনীবালা দেৱী ছাত্ৰী নিৱাস', 'hostel', 27.4473557, 94.9013258, 0.734819, 0.586884),
 ('Padmakumari Gohain Women''s Hostel', 'পদ্মকুমাৰী গোহাঞি মহিলা হোষ্টেল', 'hostel', 27.4470096, 94.9002212, 0.700248, 0.603862),
 ('Padmanath Gohain Baruah Chatra Nivas (PNGBCN)', 'পদ্মনাথ গোহাঞিবৰুৱা ছাত্ৰ নিৱাস (PNGBCN)', 'hostel', 27.4514408, 94.8992517, 0.667352, 0.396189),
 ('Pavilion Play Ground No. 1', 'পেভিলিয়ন খেলপথাৰ নং ১', 'sports', 27.4497852, 94.8930308, 0.472501, 0.477994),
 ('Punjab National Bank', 'পাঞ্জাব নেচনেল বেংক', 'other', 27.4506061, 94.8940709, 0.504787, 0.438741),
 ('Puspalata Das Chatri Nivas (PDCN)', 'পুষ্পলতা দাস ছাত্ৰী নিৱাস (PDCN)', 'hostel', 27.4475386, 94.9016076, 0.743588, 0.578106),
 ('Rangghar Auditorium', 'ৰংঘৰ প্ৰেক্ষাগৃহ', 'event', 27.4496013, 94.8962796, 0.574825, 0.48456),
 ('SBI ATM (near Post Office)', 'SBI এ.টি.এম. (ডাকঘৰৰ ওচৰত)', 'other', 27.4489596, 94.8920596, 0.442385, 0.517422),
 ('SBI ATM (near Administrative Building)', 'SBI এ.টি.এম. (প্ৰশাসনিক ভৱনৰ ওচৰত)', 'other', 27.4495, 94.8979, 0.625867, 0.488285),
 ('SBI Branch, Dibrugarh University', 'SBI শাখা, ডিব্ৰুগড় বিশ্ববিদ্যালয়', 'other', 27.4514665, 94.890255, 0.384257, 0.400734),
 ('Swarnalata Baruah Chatri Nivas (SLBCN)', 'স্বৰ্ণলতা বৰুৱা ছাত্ৰী নিৱাস (SLBCN)', 'hostel', 27.4470745, 94.9010056, 0.724895, 0.600308),
 ('UGC''s Centre for Women''s Studies', 'ইউ.জি.চি. মহিলা অধ্যয়ন কেন্দ্ৰ', 'academic', 27.4508791, 94.895216, 0.540671, 0.425176),
 ('University Park', 'বিশ্ববিদ্যালয় উদ্যান', 'sports', 27.4463568, 94.8978904, 0.627258, 0.636041),
 ('University Science Instrumentation Centre', 'বিশ্ববিদ্যালয় বিজ্ঞান যন্ত্ৰপাতি কেন্দ্ৰ', 'academic', 27.4478171, 94.8939934, 0.503848, 0.569891),
 ('Vice-Chancellor''s Office', 'উপাচাৰ্যৰ কাৰ্যালয়', 'admin', 27.4496373, 94.8973141, 0.607357, 0.482206),
 ('Vishranta Guest House', 'বিশ্ৰান্ত অতিথিশালা', 'other', 27.4459063, 94.8962703, 0.576521, 0.658255)
) as v(name_en, name_as, type, lat, lng, map_x, map_y)
where not exists (select 1 from locations l where l.name_en = v.name_en);

-- AI model chains per purpose. Model ids are editable in the system panel.
-- 'gemini-flash-latest' / 'gemini-flash-lite-latest' are Google aliases that track the newest models.
insert into ai_providers (provider, model, purpose, priority, caps) values
 ('google','gemini-flash-latest','intake',10,'{vision,assamese,json}'),
 ('google','gemini-flash-lite-latest','intake',20,'{vision,assamese,json}'),
 ('google','gemini-embedding-001','embed',10,'{embed}'),
 ('google','gemini-flash-lite-latest','dedup_verify',10,'{assamese,json}'),
 ('google','gemini-flash-latest','dedup_verify',20,'{assamese,json}'),
 ('google','gemini-flash-latest','agent',10,'{tools,assamese}'),
 ('google','gemini-flash-lite-latest','agent',20,'{tools,assamese}'),
 ('google','gemini-flash-latest','reply_draft',10,'{assamese}'),
 ('google','gemini-flash-lite-latest','translate_msg',10,'{assamese}'),
 ('google','gemini-flash-latest','translate_msg',20,'{assamese}'),
 ('google','gemini-flash-latest','resolution_check',10,'{vision,json}'),
 ('google','gemini-flash-latest','daily_brief',10,'{assamese}');

-- OpenRouter fallback (free models only; "auto:free" is expanded at runtime to currently free models)
insert into ai_providers (provider, model, purpose, priority, caps) values
 ('openrouter','auto:free','intake',90,'{vision,assamese,json}'),
 ('openrouter','auto:free','dedup_verify',90,'{assamese,json}'),
 ('openrouter','auto:free','agent',90,'{tools,assamese}'),
 ('openrouter','auto:free','reply_draft',90,'{assamese}'),
 ('openrouter','auto:free','translate_msg',90,'{assamese}'),
 ('openrouter','auto:free','daily_brief',90,'{assamese}');

commit;
