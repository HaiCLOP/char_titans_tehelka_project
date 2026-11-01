-- CivicSense: video report update for an EXISTING CivicSense Supabase project.
-- Run in Supabase SQL Editor as postgres. Safe to run again.
-- Preserves existing users, complaints, uploaded files, and access policies.
-- This applies the video feature migration only; it is not a full schema upgrade
-- from an arbitrary older version of CivicSense.
begin;

alter table public.complaints
  add column if not exists video_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-videos', 'complaint-videos', false, 41943040,
        array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $video_policies$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'upload own complaint videos'
  ) then
    execute $policy$
      create policy "upload own complaint videos" on storage.objects
      for insert to authenticated with check (
        bucket_id = 'complaint-videos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    $policy$;
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname = 'read own complaint videos'
  ) then
    execute $policy$
      create policy "read own complaint videos" on storage.objects
      for select to authenticated using (
        bucket_id = 'complaint-videos'
        and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
      )
    $policy$;
  end if;
end
$video_policies$;

commit;

select 'CivicSense video update applied successfully' as result;
