-- Knowledge sources: the per-project limit function and the private Storage
-- bucket (docs/project.md §3 "File storage", §5, §6.4 "Upload" and "Limit",
-- §7, §9 "Database API" and "File upload"). Adds a function and a bucket
-- only; no table, column or policy changes.

-- ---------------------------------------------------------------------------
-- reserve_knowledge_source: add one source under the project's limit.
--
-- The route passes the limit from PLAN_LIMITS[plan].knowledgeSources
-- (packages/shared), after reading the plan on the server.
--
--   pasted text: p_type 'text', p_status 'processing', storage_key null
--   file:        p_type 'pdf' | 'md' | 'txt', p_status 'uploading',
--                storage_key '<project_id>/<source_id>.<type>'
--
-- Reclaim: first deletes this project's `uploading` sources created more than
-- 2 hours ago (a reservation that was never finalized) and returns their
-- storage keys, so the route can delete those files through the Storage API.
-- Then counts every remaining source, whatever its status: fresh `uploading`
-- reservations count toward the limit.
--
-- Returns one row: the new knowledge_sources row's columns plus
-- `reclaimed_storage_keys` (text[], empty when nothing was reclaimed). A flat
-- row reads directly in supabase-js (`.rpc(...).single()`).
--
-- Concurrency: the project row is locked (FOR UPDATE) before reclaiming and
-- counting, so two concurrent calls for one project run one after the other
-- and can't both pass the check. It's the only lock taken before the writes,
-- so lock order can't deadlock. `finalize` claims a source with
-- `update … where status = 'uploading'`; if a reclaim deleted it first, the
-- claim finds nothing and the route refuses the file.
--
-- Errors the route matches on (SQLSTATE, plus a fixed message prefix):
--   KV004  'project_not_found: …'     no project p_project_id
--   KV005  'knowledge_limit: …'       the project already has p_max_sources
--   22023  invalid_parameter_value    p_max_sources null or negative, or
--                                     p_type/p_status not a valid pair
--   23514  check_violation            blank or too long title
-- Nothing is inserted or reclaimed when any of them is raised.
-- ---------------------------------------------------------------------------

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_status text,
  p_max_sources integer
)
returns table (
  id uuid,
  project_id uuid,
  title text,
  type text,
  storage_key text,
  status text,
  created_at timestamptz,
  reclaimed_storage_keys text[]
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_reclaimed text[];
  v_count integer;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_source public.knowledge_sources;
begin
  if p_max_sources is null or p_max_sources < 0 then
    raise exception 'p_max_sources must be a non-negative integer'
      using errcode = 'invalid_parameter_value';
  end if;

  if not (
    (p_type = 'text' and p_status = 'processing')
    or (p_type in ('pdf', 'md', 'txt') and p_status = 'uploading')
  ) then
    raise exception 'p_type and p_status must be text/processing or a file type/uploading'
      using errcode = 'invalid_parameter_value';
  end if;

  perform 1
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    raise exception 'project_not_found: no such project'
      using errcode = 'KV004';
  end if;

  with reclaimed as (
    delete from public.knowledge_sources s
    where s.project_id = p_project_id
      and s.status = 'uploading'
      and s.created_at < pg_catalog.now() - interval '2 hours'
    returning s.storage_key
  )
  select coalesce(pg_catalog.array_agg(r.storage_key) filter (where r.storage_key is not null), '{}')
  into v_reclaimed
  from reclaimed r;

  select count(*)
  into v_count
  from public.knowledge_sources s
  where s.project_id = p_project_id;

  if v_count >= p_max_sources then
    raise exception 'knowledge_limit: the plan allows % source(s) per project', p_max_sources
      using errcode = 'KV005';
  end if;

  insert into public.knowledge_sources (id, project_id, title, type, storage_key, status)
  values (
    v_id,
    p_project_id,
    p_title,
    p_type,
    case when p_type = 'text' then null else p_project_id::text || '/' || v_id::text || '.' || p_type end,
    p_status
  )
  returning * into v_source;

  return query
  select
    v_source.id,
    v_source.project_id,
    v_source.title,
    v_source.type,
    v_source.storage_key,
    v_source.status,
    v_source.created_at,
    v_reclaimed;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new functions in public to
-- anon and authenticated: only the server (service_role) may call this.
revoke execute on function public.reserve_knowledge_source(uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_knowledge_source(uuid, text, text, text, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- The `knowledge` bucket: private, 10 MB (MAX_KNOWLEDGE_FILE_BYTES), and the
-- three ALLOWED_FILE_TYPES MIME types (packages/shared/src/limits.ts).
--
-- No storage.objects policies: anon and authenticated get nothing. Only the
-- server (service role) and one-time signed upload URLs reach it.
--
-- Idempotent: re-running it (or a bucket made by hand on dev) leaves one
-- `knowledge` bucket with exactly these settings.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/plain']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
