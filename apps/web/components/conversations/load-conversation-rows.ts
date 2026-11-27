import "server-only";
import { listConversations } from "@/lib/conversations/conversations";
import type { OwnerClient } from "@/lib/supabase/owner";
import type { ConversationRow } from "./conversation-list";
import { toConversationRows } from "./conversations-view";

/** The project's list rows (owner client, RLS), or null when the project isn't the owner's. */
export async function loadConversationRows(client: OwnerClient, projectId: string): Promise<ConversationRow[] | null> {
  const conversations = await listConversations(client, projectId);
  return conversations ? toConversationRows(projectId, conversations) : null;
}
