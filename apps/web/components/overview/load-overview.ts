import "server-only";
import { knowledgeSourceStatusSchema } from "@kivo/shared";
import type { OwnerClient } from "@/lib/supabase/owner";
import type { OverviewData, RecentConversation } from "./overview";

export const RECENT_LIMIT = 5;
const PREVIEW_LENGTH = 120;

function preview(body: string): string {
  const characters = Array.from(body);
  if (characters.length <= PREVIEW_LENGTH) return body;
  return `${characters.slice(0, PREVIEW_LENGTH - 1).join("")}…`;
}

type RecentRow = { id: string; created_at: string; first_visitor: { body: string }[] };

/**
 * The Overview's numbers for one project, read with the owner client so RLS
 * only returns the signed-in owner's rows. The caller has already checked the
 * project is theirs (loadOwnedProject). Any failed read throws to the error state.
 */
export async function loadOverview(client: OwnerClient, projectId: string): Promise<OverviewData> {
  const [conversations, recent, sources] = await Promise.all([
    client.from("conversations").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    client
      .from("conversations")
      .select("id, created_at, first_visitor:messages(body)")
      .eq("project_id", projectId)
      .eq("first_visitor.role", "visitor")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .order("created_at", { referencedTable: "first_visitor" })
      .order("id", { referencedTable: "first_visitor" })
      .limit(1, { referencedTable: "first_visitor" })
      .limit(RECENT_LIMIT),
    client.from("knowledge_sources").select("status").eq("project_id", projectId),
  ]);
  if (conversations.error || conversations.count === null) {
    throw new Error(`Count conversations failed (${conversations.error?.code ?? "no count"}).`);
  }
  if (recent.error) throw new Error(`Recent conversations failed (${recent.error.code}).`);
  if (sources.error) throw new Error(`Read knowledge sources failed (${sources.error.code}).`);

  const statuses = sources.data.map((row) => knowledgeSourceStatusSchema.parse(row.status));
  const recentConversations: RecentConversation[] = (recent.data as RecentRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    preview: preview(row.first_visitor[0]?.body ?? ""),
  }));
  return {
    conversationCount: conversations.count,
    sourceCount: statuses.length,
    readySourceCount: statuses.filter((status) => status === "ready").length,
    recent: recentConversations,
  };
}
