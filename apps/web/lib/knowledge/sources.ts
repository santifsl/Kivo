import "server-only";
import {
  type KnowledgeFileType,
  type KnowledgeSourceType,
  knowledgeSourceStatusSchema,
  knowledgeSourceTypeSchema,
  PLAN_LIMITS,
  type KnowledgeSource,
  type Plan,
} from "@kivo/shared";
import type { OwnerClient } from "../supabase/owner";
import type { ServiceClient } from "../supabase/service";

// Knowledge source rows and their Storage files. docs/project.md §6.4, §7, §9.

/** The private Storage bucket for knowledge files (migration 20261120213937_knowledge.sql). */
export const KNOWLEDGE_BUCKET = "knowledge";

const SOURCE_COLUMNS = "id, project_id, title, type, storage_key, status, created_at";

/** `reserve_knowledge_source` refused: the project is at its plan's source limit. */
export class KnowledgeLimitError extends Error {
  constructor() {
    super("Knowledge source limit reached for this plan.");
    this.name = "KnowledgeLimitError";
  }
}

/** `reserve_knowledge_source` found no project (deleted after the ownership check). */
export class ProjectGoneError extends Error {
  constructor() {
    super("The project no longer exists.");
    this.name = "ProjectGoneError";
  }
}

// SQLSTATEs from supabase/migrations/20261120213937_knowledge.sql.
const PROJECT_NOT_FOUND = "KV004";
const KNOWLEDGE_LIMIT = "KV005";

interface SourceRow {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
  created_at: string;
}

/** A row as the `KnowledgeSource` contract type, checking `type` and `status`. */
export function toKnowledgeSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    type: knowledgeSourceTypeSchema.parse(row.type),
    storage_key: row.storage_key,
    status: knowledgeSourceStatusSchema.parse(row.status),
    created_at: row.created_at,
  };
}

type Reservation = { source: KnowledgeSource; reclaimedStorageKeys: string[] };

async function reserve(
  client: ServiceClient,
  projectId: string,
  title: string,
  plan: Plan,
  type: KnowledgeSourceType,
): Promise<Reservation> {
  const { data, error } = await client
    .rpc("reserve_knowledge_source", {
      p_project_id: projectId,
      p_title: title,
      p_type: type,
      p_status: type === "text" ? "processing" : "uploading",
      p_max_sources: PLAN_LIMITS[plan].knowledgeSources,
    })
    .single();

  if (error) {
    if (error.code === KNOWLEDGE_LIMIT) throw new KnowledgeLimitError();
    if (error.code === PROJECT_NOT_FOUND) throw new ProjectGoneError();
    throw new Error(`Couldn't reserve the knowledge source: ${error.code} ${error.message}`);
  }
  return {
    source: toKnowledgeSource(data),
    reclaimedStorageKeys: data.reclaimed_storage_keys ?? [],
  };
}

/**
 * Reserves a pasted-text source (`processing`) under `plan`'s limit.
 * Call it only after the route has checked ownership, with `plan` read from
 * the database (§9 "Plan bypass", "Tenant leak").
 *
 * Returns the new source and the storage keys of stale upload reservations
 * the function reclaimed (the caller deletes those files).
 *
 * @throws KnowledgeLimitError at the limit; ProjectGoneError if the project is gone; Error otherwise.
 */
export function reserveTextSource(
  client: ServiceClient,
  projectId: string,
  title: string,
  plan: Plan,
): Promise<Reservation> {
  return reserve(client, projectId, title, plan, "text");
}

/**
 * Reserves a file source (`uploading`, storage key `<project>/<source>.<type>`)
 * under `plan`'s limit. Same rules and errors as `reserveTextSource`.
 */
export function reserveFileSource(
  client: ServiceClient,
  projectId: string,
  title: string,
  plan: Plan,
  type: KnowledgeFileType,
): Promise<Reservation> {
  return reserve(client, projectId, title, plan, type);
}

/**
 * Claims an uploaded source for processing, once: `uploading` → `processing`
 * in one UPDATE … WHERE status = 'uploading', so of two concurrent finalize
 * calls only one gets the row. `null` when there is no such upload waiting
 * (unknown id, another project, already finalized, or reclaimed).
 */
export async function claimUpload(
  client: ServiceClient,
  projectId: string,
  sourceId: string,
): Promise<KnowledgeSource | null> {
  const { data, error } = await client
    .from("knowledge_sources")
    .update({ status: "processing" })
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .eq("status", "uploading")
    .select(SOURCE_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Couldn't claim the upload: ${error.code}`);
  return data ? toKnowledgeSource(data) : null;
}

/** Puts a claimed source back to `uploading` (after an unexpected error), so finalize can be retried. */
export async function releaseUpload(
  client: ServiceClient,
  source: Pick<KnowledgeSource, "id" | "project_id">,
): Promise<void> {
  const { error } = await client
    .from("knowledge_sources")
    .update({ status: "uploading" })
    .eq("id", source.id)
    .eq("project_id", source.project_id)
    .eq("status", "processing");
  if (error) throw new Error(`Couldn't release the upload: ${error.code}`);
}

/**
 * A one-time signed upload URL for `storageKey` in the knowledge bucket.
 * Supabase signs it for this one path; without upsert it can't overwrite an
 * uploaded object, so it works once. Never a public or download URL.
 */
export async function createSignedUpload(
  client: ServiceClient,
  storageKey: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await client.storage
    .from(KNOWLEDGE_BUCKET)
    .createSignedUploadUrl(storageKey);
  if (error) throw new Error(`Couldn't create the upload URL: ${error.message}`);
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

/** The uploaded object is missing (never uploaded, or already deleted). */
export class MissingUploadError extends Error {
  constructor() {
    super("The uploaded file was not found.");
    this.name = "MissingUploadError";
  }
}

/**
 * The bytes of `storageKey` in the knowledge bucket.
 * @throws MissingUploadError when Storage answers with a 4xx (no such object); Error otherwise.
 */
export async function downloadObject(
  client: ServiceClient,
  storageKey: string,
): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(KNOWLEDGE_BUCKET).download(storageKey);
  if (error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) throw new MissingUploadError();
    throw new Error(`Couldn't download the upload: ${error.message}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * The caller's source with this id, read with the owner client so RLS only
 * finds sources in their own projects; `null` otherwise.
 */
export async function getVisibleSource(
  client: OwnerClient,
  id: string,
): Promise<KnowledgeSource | null> {
  const { data, error } = await client
    .from("knowledge_sources")
    .select(SOURCE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the knowledge source: ${error.message}`);
  return data ? toKnowledgeSource(data) : null;
}

/** Deletes these objects from the knowledge bucket. Missing objects are not an error. */
export async function removeStorageObjects(
  client: ServiceClient,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  const { error } = await client.storage.from(KNOWLEDGE_BUCKET).remove([...keys]);
  if (error) throw new Error(`Couldn't delete knowledge files: ${error.message}`);
}

/** Objects listed per round when emptying a project's folder. */
const LIST_PAGE = 1000;
/** Safety stop: a project holds at most 25 sources, so one round is the norm. */
const MAX_ROUNDS = 20;

/**
 * Deletes every object under `<projectId>/` in the knowledge bucket. Call it
 * only once ownership is proven (e.g. the owner client's RLS delete of the
 * project succeeded).
 */
export async function removeProjectFiles(client: ServiceClient, projectId: string): Promise<void> {
  const bucket = client.storage.from(KNOWLEDGE_BUCKET);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await bucket.list(projectId, { limit: LIST_PAGE });
    if (error) throw new Error(`Couldn't list the project's knowledge files: ${error.message}`);
    // Folder placeholders have no id; files live directly under the project folder.
    const keys = data.filter((item) => item.id !== null).map((item) => `${projectId}/${item.name}`);
    if (keys.length === 0) return;
    await removeStorageObjects(client, keys);
    if (data.length < LIST_PAGE) return;
  }
  throw new Error("Couldn't empty the project's knowledge folder: too many files.");
}

/** Deletes a source row with the service client; its chunks cascade. */
export async function deleteSourceRow(
  client: ServiceClient,
  source: Pick<KnowledgeSource, "id" | "project_id">,
): Promise<void> {
  const { error } = await client
    .from("knowledge_sources")
    .delete()
    .eq("id", source.id)
    .eq("project_id", source.project_id);
  if (error) throw new Error(`Couldn't delete the knowledge source: ${error.message}`);
}
