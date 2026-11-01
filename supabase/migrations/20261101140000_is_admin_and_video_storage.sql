-- Migration 20: finish the storage rules from the holamigo branch.
-- The photo and video read policies call is_admin(), which did not exist, so reads that reached those policies
-- failed. Admins read evidence through server-signed links (createSignedUrls with the service role), so the
-- storage policy only needs to let super admins read directly; dept admins are not given cross-department
-- access to the raw bucket. Also creates the complaint-videos bucket and complaints.video_urls, which the
-- video upload route and the submit pipeline already use.

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select current_role_is('super_admin')
$$;
revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

alter table complaints add column if not exists video_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-videos', 'complaint-videos', false, 41943040, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own complaint videos" on storage.objects;
create policy "upload own complaint videos" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "read own complaint videos" on storage.objects;
create policy "read own complaint videos" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-videos' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
