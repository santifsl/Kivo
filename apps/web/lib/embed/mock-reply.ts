import type { ChatRequest, ChatResponse } from "@kivo/shared";
import { randomId } from "./random-id";

/** Fixed reply until Phase 3 wires the real chat route. */
export const MOCK_REPLY =
  "Thanks for your message! This is a preview reply. Real answers from your knowledge base come soon.";
export const MOCK_REPLY_DELAY_MS = 800;

/**
 * Sends one chat message and resolves to the bot's reply.
 *
 * Mock for now: waits ~800 ms and returns MOCK_REPLY. Phase 3 swaps the body
 * for `POST /api/widget/chat` with the same ChatRequest → ChatResponse shapes.
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_REPLY_DELAY_MS));
  return { conversationId: request.conversationId ?? randomId(), reply: MOCK_REPLY };
}
