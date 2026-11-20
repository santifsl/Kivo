-- Chat database functions for POST /api/widget/chat (docs/project.md §6.6,
-- §6.12, §7 "Limits run inside Postgres functions", §9 "Database API",
-- "Tenant leak"). Adds functions only; no table, column or policy changes.
--
-- All three are SECURITY INVOKER with an empty search_path, and only
-- service_role may execute them. The route resolves the project from its
-- public key before calling any of them.

-- ---------------------------------------------------------------------------
-- consume_message: count one visitor message against the monthly quota.
--
-- Returns true if the message was counted, false at the limit (or for an
-- unknown project, or p_limit <= 0 / null). The route passes the limit from
-- PLAN_LIMITS[plan].messagesPerMonth (packages/shared).
--
-- Concurrency: one UPDATE statement. Two concurrent calls for one project
-- serialize on the row lock; the second re-checks the WHERE clause against
-- the row the first one wrote (READ COMMITTED re-evaluation), so both can't
-- pass at messages_used = limit - 1.
--
-- Rollover: a period_start before the start of the current UTC month resets
-- the count to 1 (this message) and moves period_start to the month start.
-- ---------------------------------------------------------------------------

create function public.consume_message(p_project_id uuid, p_limit integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with month as (
    select pg_catalog.date_trunc('month', pg_catalog.now(), 'UTC') as start
  ),
  counted as (
    update public.projects p
    set
      messages_used = case when p.period_start < m.start then 1 else p.messages_used + 1 end,
      period_start = case when p.period_start < m.start then m.start else p.period_start end
    from month m
    where p.id = p_project_id
      and p_limit > 0
      and (p.period_start < m.start or p.messages_used < p_limit)
    returning 1
  )
  select exists (select 1 from counted);
$$;

revoke execute on function public.consume_message(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_message(uuid, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- save_chat_turn: store one visitor message and the bot's reply.
--
-- p_conversation_id null → creates a conversation in p_project_id for
-- p_visitor_id. Otherwise the conversation must belong to p_project_id.
-- Returns the conversation id.
--
-- Ordering: the visitor message's created_at is strictly after the
-- conversation's latest message, and the bot reply's strictly after the
-- visitor message's, so ordering by created_at always shows the turns in
-- order, even if the clock is coarse or steps back. (now() is fixed for the
-- transaction, so it can't be used for both rows.) An existing conversation's
-- row is locked (FOR UPDATE) so two turns on it can't interleave.
--
-- Errors the route matches on (SQLSTATE, plus a fixed message prefix):
--   KV003  'conversation_not_found: …'  p_conversation_id isn't in this project
--   23503  foreign_key_violation        p_project_id doesn't exist
--   23514  check_violation              empty body or invalid visitor_id
-- Nothing is inserted when any of them is raised.
-- ---------------------------------------------------------------------------

create function public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_visitor_at timestamptz;
begin
  if p_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    select c.id
    into v_conversation_id
    from public.conversations c
    where c.id = p_conversation_id
      and c.project_id = p_project_id
    for update;

    if not found then
      raise exception 'conversation_not_found: no such conversation in this project'
        using errcode = 'KV003';
    end if;
  end if;

  select greatest(
    pg_catalog.clock_timestamp(),
    max(m.created_at) + interval '1 microsecond'
  )
  into v_visitor_at
  from public.messages m
  where m.conversation_id = v_conversation_id;

  insert into public.messages (conversation_id, role, body, created_at)
  values
    (v_conversation_id, 'visitor', p_visitor_message, v_visitor_at),
    (
      v_conversation_id,
      'bot',
      p_bot_reply,
      greatest(pg_catalog.clock_timestamp(), v_visitor_at + interval '1 microsecond')
    );

  return v_conversation_id;
end;
$$;

revoke execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- match_chunks: the p_count chunks most similar to p_embedding, from `ready`
-- sources of p_project_id only. Best first; similarity = 1 - cosine distance.
--
-- Ordered by the cosine distance operator so the planner can use the HNSW
-- index (knowledge_chunks_embedding_idx, vector_cosine_ops).
--
-- Filter starvation: a plain HNSW scan returns hnsw.ef_search (40) nearest
-- candidates across all projects, then filters them, so a small project in a
-- large table could get fewer than p_count rows, or none. The function sets
-- hnsw.iterative_scan = strict_order (pgvector >= 0.8; dev runs 0.8.2): the
-- scan keeps going until enough rows pass the filters (bounded by
-- hnsw.max_scan_tuples), and results stay in exact distance order. The
-- setting is scoped to the call. When the planner picks the project_id
-- btree index instead (small projects), the result is exact anyway.
--
-- Errors: 22023 invalid_parameter_value if p_count is null or not 1–50.
-- ---------------------------------------------------------------------------

-- Load pgvector's library before creating match_chunks. Until it is loaded,
-- Postgres doesn't know hnsw.iterative_scan, and a non-superuser (Supabase's
-- migration role) can't put an unknown setting in a function's SET clause:
-- "42501 permission denied to set parameter". Any vector cast loads it.
select '[1]'::extensions.vector;

create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_count integer default 5
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = 'strict_order'
as $$
begin
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'p_count must be between 1 and 50'
      using errcode = 'invalid_parameter_value';
  end if;

  return query
  select
    c.id,
    c.source_id,
    c.content,
    1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s
    on s.id = c.source_id
   and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
  order by c.embedding operator(extensions.<=>) p_embedding
  limit p_count;
end;
$$;

revoke execute on function public.match_chunks(uuid, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.match_chunks(uuid, extensions.vector, integer)
  to service_role;
