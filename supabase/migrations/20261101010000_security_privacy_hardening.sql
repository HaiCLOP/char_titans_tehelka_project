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

