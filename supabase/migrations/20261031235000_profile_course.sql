-- Migration 8: students give their course/programme instead of choosing a department.
-- Departments are fixing units (Water & Sanitation, Electrical…); only staff belong to one.
alter table profiles add column if not exists course text check (course is null or char_length(course) <= 80);
comment on column profiles.course is 'Programme/course a student studies (profile info only; students never belong to a fixing department)';
