-- Initial schema: every table in docs/project.md §7, with RLS, policies and grants.
--
-- Access model (project.md §7 "Tenant isolation", §9 "Database API"):
--   anon           nothing: no table, no function
--   authenticated  SELECT rows in their own projects; rename (name only) and
--                  delete their own projects. Nothing else.
--   service_role   everything (server only)
--
-- Supabase's default privileges grant ALL on new tables and EXECUTE on new
-- functions to anon and authenticated, so every grant below starts from an
-- explicit revoke.
--
-- Check constraints mirror packages/shared (enums.ts, widget.ts, api/*.ts).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.accounts (
  clerk_user_id text primary key check (clerk_user_id <> ''),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.accounts (clerk_user_id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  public_key text not null unique check (public_key ~ '^pk_[A-Za-z0-9_-]{8,64}$'),
  messages_used integer not null default 0 check (messages_used >= 0),
  period_start timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.widget_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  button_color text not null check (button_color ~ '^#[0-9a-fA-F]{6}$'),
  position text not null
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  label text not null check (btrim(label) <> '' and char_length(label) <= 30),
  animation text not null check (animation in ('fade', 'slide', 'scale')),
  header_text text not null
    check (btrim(header_text) <> '' and char_length(header_text) <= 80),
  show_badge boolean not null
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  type text not null check (type in ('text', 'pdf', 'md', 'txt')),
  storage_key text, -- null for pasted text
  status text not null check (status in ('uploading', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  -- Target for knowledge_chunks' (source_id, project_id) foreign key.
  unique (id, project_id)
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null,
  content text not null,
  embedding extensions.vector(1536) not null,
  -- A chunk always belongs to its source's project: chunk search is scoped by
  -- project_id, so the two must never disagree.
  foreign key (source_id, project_id)
    references public.knowledge_sources (id, project_id) on delete cascade
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  visitor_id text not null check (btrim(visitor_id) <> '' and char_length(visitor_id) <= 64),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('visitor', 'bot')),
  body text not null check (body <> ''),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (every foreign key, plus the vector index)
-- ---------------------------------------------------------------------------

create index projects_owner_id_idx on public.projects (owner_id);
-- widget_configs.project_id is the primary key.
create index knowledge_sources_project_id_idx on public.knowledge_sources (project_id);
create index knowledge_chunks_project_id_idx on public.knowledge_chunks (project_id);
create index knowledge_chunks_source_id_project_id_idx
  on public.knowledge_chunks (source_id, project_id);
create index conversations_project_id_idx on public.conversations (project_id);
create index messages_conversation_id_idx on public.messages (conversation_id);

create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
-- In a schema the Data API doesn't expose, so they can't be called as RPC.
-- SECURITY DEFINER so policies on child tables don't re-run the projects
-- policy per row. Both read the caller's Clerk user id from the JWT.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create function private.owned_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.projects p
  where p.owner_id = (select auth.jwt() ->> 'sub');
$$;

create function private.owned_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.conversations c
  where c.project_id in (select private.owned_project_ids());
$$;

revoke execute on function private.owned_project_ids() from public, anon;
revoke execute on function private.owned_conversation_ids() from public, anon;
grant execute on function private.owned_project_ids() to authenticated, service_role;
grant execute on function private.owned_conversation_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.accounts enable row level security;
alter table public.projects enable row level security;
alter table public.widget_configs enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Owners read their own account"
  on public.accounts for select to authenticated
  using (clerk_user_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their own projects"
  on public.projects for select to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners rename their own projects"
  on public.projects for update to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'))
  with check (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners delete their own projects"
  on public.projects for delete to authenticated
  using (owner_id = (select auth.jwt() ->> 'sub'));

create policy "Owners read their projects' widget configs"
  on public.widget_configs for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' knowledge sources"
  on public.knowledge_sources for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' conversations"
  on public.conversations for select to authenticated
  using (project_id in (select private.owned_project_ids()));

create policy "Owners read their projects' messages"
  on public.messages for select to authenticated
  using (conversation_id in (select private.owned_conversation_ids()));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on table
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
from public, anon, authenticated;

grant select on table
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
to authenticated;

-- Owners may change only a project's name (column-level grant), and delete it.
grant update (name) on table public.projects to authenticated;
grant delete on table public.projects to authenticated;

grant all on table
  public.accounts,
  public.projects,
  public.widget_configs,
  public.knowledge_sources,
  public.knowledge_chunks,
  public.conversations,
  public.messages
to service_role;
