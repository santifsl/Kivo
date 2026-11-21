import "server-only";
import {
  type ConversationSummary,
  type GetConversationResponse,
  type Message,
  messageRoleSchema,
} from "@kivo/shared";
import { getOwnedProject } from "../projects/projects";
import type { OwnerClient } from "../supabase/owner";

const PAGE_SIZE = 500;
const PREVIEW_LENGTH = 120;

// The API returns full lists. Page Data API reads to stay below its row limit.
// A stable cursor keeps equal timestamps and new inserts from shifting pages.
async function* pages<Row>(
  operation: string,
  read: (after: Row | undefined) => PromiseLike<{
    data: Row[] | null;
    error: { code: string } | null;
  }>,
): AsyncGenerator<Row[]> {
  let after: Row | undefined;
  for (;;) {
    const { data, error } = await read(after);
    if (error || !data) throw new Error(`${operation} failed (${error?.code ?? "no data"}).`);
    after = data.at(-1);
    if (!after) return;
    yield data;
    if (data.length < PAGE_SIZE) return;
  }
}

function preview(body: string): string {
  const characters = Array.from(body);
  if (characters.length <= PREVIEW_LENGTH) return body;
  return `${characters.slice(0, PREVIEW_LENGTH - 1).join("")}…`;
}

type DatedRow = { id: string; created_at: string };

function afterDate(row: DatedRow, comparison: "lt" | "gt"): string {
  return `created_at.${comparison}.${row.created_at},and(created_at.eq.${row.created_at},id.${comparison}.${row.id})`;
}

type SummaryRow = DatedRow & { visitor_id: string; first_visitor: { body: string }[] };
type CountRow = { id: string; conversation_id: string };
type MessageRow = Omit<Message, "role"> & { role: string };

/** Full newest-first list, or null when the project's row is hidden by RLS or absent. */
export async function listConversations(
  client: OwnerClient,
  projectId: string,
): Promise<ConversationSummary[] | null> {
  if (!(await getOwnedProject(client, projectId))) return null;

  const summaries = new Map<string, ConversationSummary>();
  for await (const rows of pages<SummaryRow>("List conversations", (after) => {
    // The embedded limit applies to each conversation. The left embed also
    // preserves conversations with no visitor message.
    const query = client
      .from("conversations")
      .select("id, visitor_id, created_at, first_visitor:messages(body)")
      .eq("project_id", projectId)
      .eq("first_visitor.role", "visitor")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .order("created_at", { referencedTable: "first_visitor" })
      .order("id", { referencedTable: "first_visitor" })
      .limit(1, { referencedTable: "first_visitor" })
      .limit(PAGE_SIZE);
    return after ? query.or(afterDate(after, "lt")) : query;
  })) {
    for (const { id, visitor_id, created_at, first_visitor } of rows) {
      summaries.set(id, {
        id,
        visitor_id,
        created_at,
        preview: preview(first_visitor[0]?.body ?? ""),
        message_count: 0,
      });
    }
  }

  if (summaries.size === 0) return [];

  // Stream only the IDs needed to count messages. The project filter and RLS
  // apply in Postgres, and each page covers messages across conversations.
  for await (const rows of pages<CountRow>("Count conversation messages", (after) => {
    const query = client
      .from("messages")
      .select("id, conversation_id, conversations!inner()")
      .eq("conversations.project_id", projectId)
      .order("id")
      .limit(PAGE_SIZE);
    return after ? query.gt("id", after.id) : query;
  })) {
    for (const { conversation_id } of rows) {
      const summary = summaries.get(conversation_id);
      if (summary) summary.message_count++;
    }
  }

  return [...summaries.values()];
}

/** Full oldest-first thread, or null when RLS doesn't return the conversation. */
export async function getConversation(
  client: OwnerClient,
  id: string,
): Promise<GetConversationResponse | null> {
  const { data: conversation, error } = await client
    .from("conversations")
    .select("id, project_id, visitor_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Read conversation failed (${error.code}).`);
  if (!conversation) return null;

  const messages: Message[] = [];
  for await (const rows of pages<MessageRow>("Read conversation messages", (after) => {
    const query = client
      .from("messages")
      .select("id, conversation_id, role, body, created_at")
      .eq("conversation_id", id)
      .order("created_at")
      .order("id")
      .limit(PAGE_SIZE);
    return after ? query.or(afterDate(after, "gt")) : query;
  })) {
    for (const row of rows) messages.push({ ...row, role: messageRoleSchema.parse(row.role) });
  }

  return { conversation, messages };
}
