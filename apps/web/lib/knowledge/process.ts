import "server-only";
import { embed } from "../openai/embed";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";
import { normalizeText } from "./extract";

// The processing pipeline shared by pasted text and uploaded files:
// chunk → embed → store in pgvector → `ready`. docs/project.md §6.4 "Processing".

/** Chunk rows per insert request (each row carries a 1,536-number vector). */
const INSERT_BATCH = 50;

/** pgvector's text form, `[0.1,0.2,…]`, as the `embedding` column takes it through PostgREST. */
const toVector = (values: readonly number[]) => JSON.stringify(values);

/** Something the pipeline refuses on purpose, e.g. text with nothing to chunk. */
class ProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessingError";
  }
}

async function deleteChunks(client: ServiceClient, sourceId: string, projectId: string) {
  const { error } = await client
    .from("knowledge_chunks")
    .delete()
    .eq("source_id", sourceId)
    .eq("project_id", projectId);
  if (error) throw new Error(`Couldn't delete chunks: ${error.code}`);
}

async function setStatus(
  client: ServiceClient,
  sourceId: string,
  projectId: string,
  status: "ready" | "failed",
) {
  const { error } = await client
    .from("knowledge_sources")
    .update({ status })
    .eq("id", sourceId)
    .eq("project_id", projectId);
  if (error) throw new Error(`Couldn't set the source status: ${error.code}`);
}

/** A loggable description of an error that never includes the source's text. */
function errorLabel(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? `${err.name} ${status}` : err.name;
}

/**
 * Chunks `text`, embeds the chunks, stores them for the source and marks it
 * `ready`. Idempotent per source: existing chunks are deleted first.
 *
 * Never throws. On any error it deletes the chunks it wrote, marks the source
 * `failed`, and logs the source id only (never the text). If the source was
 * deleted meanwhile, the inserts fail on the foreign key and the status
 * updates touch no row, so nothing is left behind.
 *
 * Call it only for a source the route reserved or claimed after its
 * ownership check: it writes with the service client.
 */
export async function processSource(
  sourceId: string,
  projectId: string,
  text: string,
  getClient: () => ServiceClient = createServiceClient,
): Promise<"ready" | "failed"> {
  let client: ServiceClient;
  try {
    client = getClient();
  } catch (err) {
    console.error(`[knowledge] Processing failed for source ${sourceId}: ${errorLabel(err)}`);
    return "failed";
  }

  try {
    await deleteChunks(client, sourceId, projectId);

    const chunks = chunkText(normalizeText(text));
    if (chunks.length === 0) throw new ProcessingError("no text to chunk");
    const vectors = await embed(chunks);

    for (let start = 0; start < chunks.length; start += INSERT_BATCH) {
      const rows = chunks.slice(start, start + INSERT_BATCH).map((content, i) => ({
        source_id: sourceId,
        project_id: projectId,
        content,
        embedding: toVector(vectors[start + i] ?? []),
      }));
      const { error } = await client.from("knowledge_chunks").insert(rows);
      if (error) throw new Error(`Couldn't insert chunks: ${error.code}`);
    }

    await setStatus(client, sourceId, projectId, "ready");
    return "ready";
  } catch (err) {
    console.error(`[knowledge] Processing failed for source ${sourceId}: ${errorLabel(err)}`);
    // Each step on its own, so a failed chunk delete still marks the source failed.
    for (const step of [
      () => deleteChunks(client, sourceId, projectId),
      () => setStatus(client, sourceId, projectId, "failed"),
    ]) {
      try {
        await step();
      } catch (cleanupErr) {
        console.error(
          `[knowledge] Cleanup failed for source ${sourceId}: ${errorLabel(cleanupErr)}`,
        );
      }
    }
    return "failed";
  }
}
