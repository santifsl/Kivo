import "server-only";
import {
  type KnowledgeSource,
  knowledgeSourceStatusSchema,
  knowledgeSourceTypeSchema,
} from "@kivo/shared";
import type { OwnerClient } from "@/lib/supabase/owner";

/**
 * A project's knowledge sources, newest first, read with the owner client so
 * RLS only returns sources of the signed-in owner's projects.
 */
export async function loadSources(
  client: OwnerClient,
  projectId: string,
): Promise<KnowledgeSource[]> {
  const { data, error } = await client
    .from("knowledge_sources")
    .select("id, project_id, title, type, storage_key, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't read the knowledge sources: ${error.message}`);
  return data.map((row) => ({
    ...row,
    type: knowledgeSourceTypeSchema.parse(row.type),
    status: knowledgeSourceStatusSchema.parse(row.status),
  }));
}
