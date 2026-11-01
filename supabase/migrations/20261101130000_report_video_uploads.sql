alter table complaints add column if not exists video_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-videos', 'complaint-videos', false, 41943040, array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "upload own complaint videos" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own complaint videos" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-videos' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
