import type { MessageRole } from "../enums";
import type { Timestamp } from "./common";

// Owner routes: conversations. docs/project.md §6.7, §8. Params: `idParamsSchema`.

/** A conversation in the list, newest first. */
export interface ConversationSummary {
  id: string;
  visitor_id: string;
  created_at: Timestamp;
  /** First visitor message, truncated. */
  preview: string;
  message_count: number;
}

/** GET /api/projects/:id/conversations — response. */
export interface ListConversationsResponse {
  conversations: ConversationSummary[];
}

export interface Conversation {
  id: string;
  project_id: string;
  visitor_id: string;
  created_at: Timestamp;
}

/** A message (`messages` row, §7). Render `body` as text, never HTML. */
export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  body: string;
  created_at: Timestamp;
}

/** GET /api/conversations/:id — response: the full thread, oldest first. */
export interface GetConversationResponse {
  conversation: Conversation;
  messages: Message[];
}
