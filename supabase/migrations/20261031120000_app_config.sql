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

-- TODO(Aman): replace the empty numbers with the real Dibrugarh University numbers before the demo.
-- Shown to reporters when a complaint is urgent (PRD rule 5). We never claim to dispatch help.
insert into app_config (key, value) values
 ('campus_security', '{"phone": "", "label_en": "Campus security", "label_as": "কেম্পাছ সুৰক্ষা", "todo": true}'),
 ('campus_emergency', '{"phone": "", "label_en": "Campus emergency", "label_as": "কেম্পাছ জৰুৰীকালীন সেৱা", "todo": true}');

-- ---------- system panel: force a key to behave as rate-limited (demo of failover) ----------
alter table ai_keys add column simulate_failure boolean not null default false;

-- ---------- profiles ----------
alter table profiles
  add column font_size text not null default 'normal' check (font_size in ('normal','large')),
  add column onboarded_at timestamptz; -- set by /onboarding; null ⇒ send the user through setup
