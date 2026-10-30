-- CivicSense — initial schema
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type user_role as enum ('student','staff','dept_admin','super_admin');
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
