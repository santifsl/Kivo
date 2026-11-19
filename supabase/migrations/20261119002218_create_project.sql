-- create_project: create a project and its default widget config under the
-- owner's plan limit (docs/project.md §5, §6.3, §7 "Limits run inside Postgres
-- functions"). Adds a function only; no table, column or policy changes.
--
-- The route passes the limit from PLAN_LIMITS[plan].projects (packages/shared),
-- after reading the plan on the server.
--
-- Concurrency: the owner's accounts row is locked (FOR UPDATE) before counting,
-- so two concurrent calls for one owner run one after the other and can't both
-- pass the check. It's the only lock taken, so lock order can't deadlock.
--
-- Errors the route matches on (SQLSTATE, plus a fixed message prefix):
--   KV001  'account_not_found: …'   no accounts row for p_owner_id
--   KV002  'project_limit: …'       the owner already has p_max_projects projects
--   22023  invalid_parameter_value  p_max_projects is null or negative
--   23505  unique_violation         p_public_key is taken (the route retries
--                                   with a new key)
-- Nothing is inserted when any of them is raised.

create function public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_max_projects integer
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_project public.projects;
begin
  if p_max_projects is null or p_max_projects < 0 then
    raise exception 'p_max_projects must be a non-negative integer'
      using errcode = 'invalid_parameter_value';
  end if;

  perform 1
  from public.accounts a
  where a.clerk_user_id = p_owner_id
  for update;

  if not found then
    raise exception 'account_not_found: no account for this owner'
      using errcode = 'KV001';
  end if;

  select count(*)
  into v_count
  from public.projects p
  where p.owner_id = p_owner_id;

  if v_count >= p_max_projects then
    raise exception 'project_limit: the plan allows % project(s)', p_max_projects
      using errcode = 'KV002';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, p_public_key)
  returning * into v_project;

  -- Must equal DEFAULT_WIDGET_CONFIG in packages/shared/src/widget.ts
  -- (a pglite test checks it).
  insert into public.widget_configs
    (project_id, button_color, position, label, animation, header_text, show_badge)
  values
    (v_project.id, '#000000', 'bottom-right', 'Chat', 'fade', 'How can we help?', true);

  return v_project;
end;
$$;

-- Supabase's default privileges grant EXECUTE on new functions in public to
-- anon and authenticated: only the server (service_role) may call this.
revoke execute on function public.create_project(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_project(text, text, text, integer)
  to service_role;
