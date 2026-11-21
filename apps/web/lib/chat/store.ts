import "server-only";
import { planSchema, type Plan } from "@kivo/shared";
import type { ServiceClient } from "../supabase/service";

// Database steps of POST /api/widget/chat (docs/project.md §6.6). Public route,
// no owner: the public key only identifies the project (§9 "Public key
// abuse"), so these use the service client, and every query is scoped to the
// project the key resolved to.

/** A database call failed. `code` is the PostgREST/Postgres code; the message is never logged. */
export class ChatStoreError extends Error {
  constructor(
    readonly step: string,
    readonly code: string,
  ) {
    super(`Database error in ${step} (${code}).`);
    this.name = "ChatStoreError";
  }
}

function fail(step: string, error: { code?: string }): never {
  throw new ChatStoreError(step, error.code || "unknown");
}

export interface ChatProject {
  id: string;
  ownerId: string;
  /** The owner's plan, read on the server. */
  plan: Plan;
}

/** The project with this public key and its owner's plan, or null if no project has the key. */
export async function findProjectByKey(
  client: ServiceClient,
  publicKey: string,
): Promise<ChatProject | null> {
  const { data, error } = await client
    .from("projects")
    .select("id, owner_id, accounts(plan)")
    .eq("public_key", publicKey)
    .maybeSingle();
  if (error) fail("findProjectByKey", error);
  if (!data) return null;

  const plan = planSchema.safeParse(data.accounts?.plan);
  if (!plan.success)
    console.error("[chat] Owner's plan is missing or unknown; treating it as free.");
  return { id: data.id, ownerId: data.owner_id, plan: plan.success ? plan.data : "free" };
}

/** Whether `conversationId` is a conversation of `projectId`. */
export async function conversationInProject(
  client: ServiceClient,
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) fail("conversationInProject", error);
  return data !== null;
}

/** Counts one message against the monthly quota. False when the quota is used up. */
export async function consumeMessage(
  client: ServiceClient,
  projectId: string,
  limit: number,
): Promise<boolean> {
  const { data, error } = await client.rpc("consume_message", {
    p_project_id: projectId,
    p_limit: limit,
  });
  if (error) fail("consumeMessage", error);
  return data === true;
}

/** The text of the `count` chunks of `ready` sources in this project closest to `embedding`, best first. */
export async function matchChunks(
  client: ServiceClient,
  projectId: string,
  embedding: readonly number[],
  count: number,
): Promise<string[]> {
  const { data, error } = await client.rpc("match_chunks", {
    p_project_id: projectId,
    // pgvector's text form, "[0.1,0.2,…]"; JSON arrays are the same text.
    p_embedding: JSON.stringify(embedding),
    p_count: count,
  });
  if (error) fail("matchChunks", error);
  return data.map((row) => row.content);
}

/** The conversation vanished between the check and the save (deleted meanwhile). */
export class ConversationGoneError extends Error {
  constructor() {
    super("The conversation no longer exists.");
    this.name = "ConversationGoneError";
  }
}

function failSave(error: { code?: string }): never {
  if (error.code === "KV003") throw new ConversationGoneError();
  fail("saveChatTurn", error);
}

/** Saves both messages and returns the timestamp only for the project's first reply. */
export async function saveChatTurn(
  client: ServiceClient,
  turn: {
    projectId: string;
    conversationId: string | undefined;
    visitorId: string;
    message: string;
    reply: string;
  },
): Promise<{ conversationId: string; firstChatAt: string | null }> {
  const args = {
    p_project_id: turn.projectId,
    // SQL null creates a conversation. The generated types mark function
    // arguments as non-null, so the null needs a cast.
    p_conversation_id: (turn.conversationId ?? null) as string,
    p_visitor_id: turn.visitorId,
    p_visitor_message: turn.message,
    p_bot_reply: turn.reply,
  };
  const tracked = await client.rpc("save_chat_turn_with_first_chat", args).single();
  if (!tracked.error) {
    return {
      conversationId: tracked.data.conversation_id,
      firstChatAt: tracked.data.first_chat_at ?? null,
    };
  }
  // The PR preview can use the old RPC until the new migration reaches dev.
  // Only a missing RPC is safe to retry as the old operation.
  if (tracked.error.code !== "PGRST202") failSave(tracked.error);

  const { data, error } = await client.rpc("save_chat_turn", args);
  if (error) failSave(error);
  return { conversationId: data, firstChatAt: null };
}
