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
