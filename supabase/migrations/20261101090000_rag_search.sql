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
