-- Migration 4: columns and config used by the Go backend engine (engine/).
-- Idempotent: app_config, ai_keys.simulate_failure and profiles.font_size already come from migration 3.

-- ---------- SLA alert worker: notify dept admins once per overdue complaint ----------
alter table complaints add column if not exists sla_alerted_at timestamptz;
create index if not exists complaints_sla_open on complaints (sla_due_at)
  where sla_alerted_at is null and status not in ('resolved','closed','rejected','duplicate');

-- ---------- failover demo + profile prefs (no-ops after migration 3) ----------
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

-- TODO(Aman): real Dibrugarh University numbers before the demo.
insert into app_config (key, value) values
 ('campus_security', '{"phone": "", "label_en": "Campus security", "label_as": "কেম্পাছ সুৰক্ষা", "todo": true}'),
 ('campus_emergency', '{"phone": "", "label_en": "Campus emergency", "label_as": "কেম্পাছ জৰুৰীকালীন সেৱা", "todo": true}'),
 ('demo_mode', 'false')
on conflict (key) do nothing;
