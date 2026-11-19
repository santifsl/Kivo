import "server-only";
import { PLAN_LIMITS, type Plan, type Project } from "@kivo/shared";
import type { OwnerClient } from "../supabase/owner";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import { generatePublicKey } from "./public-key";

// Project data access for the owner routes (docs/project.md §6.3, §8).
//
// Reads, renames and deletes use the owner client: RLS scopes every query to
// the signed-in owner's projects, so none of them filters by owner
// (§9 "Tenant leak"). A project that isn't the caller's simply isn't found.
// Only creation uses the service client, through `create_project`, which
// checks the plan limit under a row lock (§7).

/** The columns of a `Project` (never `owner_id`). */
export const PROJECT_COLUMNS =
  "id, name, public_key, messages_used, period_start, created_at" as const;

/** The caller's projects, newest first. */
export async function listProjects(client: OwnerClient): Promise<Project[]> {
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't list projects: ${error.message}`);
  return data;
}

/**
 * The project if the signed-in owner owns it, else `null` (not found, or
 * another owner's). Call it before any service-client write to a project.
 */
export async function getOwnedProject(client: OwnerClient, id: string): Promise<Project | null> {
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the project: ${error.message}`);
  return data;
}

/** Renames the caller's project; `null` if they don't own one with that id. */
export async function renameProject(
  client: OwnerClient,
  id: string,
  name: string,
): Promise<Project | null> {
  const { data, error } = await client
    .from("projects")
    .update({ name })
    .eq("id", id)
    .select(PROJECT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Couldn't rename the project: ${error.message}`);
  return data;
}

/** Deletes the caller's project (cascades to its data); `false` if they don't own one with that id. */
export async function deleteProject(client: OwnerClient, id: string): Promise<boolean> {
  const { data, error } = await client.from("projects").delete().eq("id", id).select("id");
  if (error) throw new Error(`Couldn't delete the project: ${error.message}`);
  return data.length > 0;
}

/** `create_project` refused: the owner is at their plan's project limit. */
export class ProjectLimitError extends Error {
  constructor() {
    super("Project limit reached for this plan.");
    this.name = "ProjectLimitError";
  }
}

// SQLSTATEs from supabase/migrations/20261119002218_create_project.sql.
const PROJECT_LIMIT = "KV002";
const UNIQUE_VIOLATION = "23505";

/**
 * Creates a project and its default widget config for `ownerId` under
 * `plan`'s project limit. `ownerId` must come from Clerk's `auth()` and
 * `plan` from the database, never from the request (§9 "Plan bypass").
 *
 * A public key collision is retried once with a new key. Throws
 * `ProjectLimitError` at the limit, and `Error` on anything else.
 */
export async function createProject(
  ownerId: string,
  name: string,
  plan: Plan,
  client: ServiceClient = createServiceClient(),
  newKey: () => string = generatePublicKey,
): Promise<Project> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await client
      .rpc("create_project", {
        p_owner_id: ownerId,
        p_name: name,
        p_public_key: newKey(),
        p_max_projects: PLAN_LIMITS[plan].projects,
      })
      .single();

    if (!error) {
      // Pick the Project fields: the row also has owner_id, which no response includes.
      const row: Project & { owner_id?: string } = data;
      return {
        id: row.id,
        name: row.name,
        public_key: row.public_key,
        messages_used: row.messages_used,
        period_start: row.period_start,
        created_at: row.created_at,
      };
    }
    if (error.code === PROJECT_LIMIT) throw new ProjectLimitError();
    if (error.code === UNIQUE_VIOLATION && attempt === 1) continue;
    throw new Error(`Couldn't create the project: ${error.code} ${error.message}`);
  }
}
