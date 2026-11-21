import "server-only";
import { createOpenAIClient } from "../openai/client";
import { buildChatPrompt, I_DONT_KNOW_REPLY } from "./prompt";

/**
 * The chat model: the cheapest current small OpenAI model (developers.openai.com
 * pricing, checked 2026-11-21: $0.10 per 1M input tokens, $0.50 per 1M
 * output). gpt-5-nano is cheaper but deprecated, shutting down 2026-12-11,
 * and OpenAI names gpt-6-luna as its replacement.
 */
export const CHAT_MODEL = "gpt-6-luna";

/** Short answers only: caps the cost of one reply. */
export const MAX_ANSWER_TOKENS = 300;

/** Low temperature: stick to the passages. */
export const ANSWER_TEMPERATURE = 0.2;

/** The model answered with nothing usable (e.g. hit the token cap with no text). */
export class ChatModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatModelError";
  }
}

/**
 * Asks `CHAT_MODEL` to answer `question` from `passages` only. Returns plain
 * text. Never called with no passages: the route sends `I_DONT_KNOW_REPLY`
 * itself then.
 *
 * @throws ChatModelError if the response has no text.
 * @throws OpenAI.APIError (from `openai`) when the request fails.
 */
export async function generateAnswer(
  question: string,
  passages: readonly string[],
): Promise<string> {
  const { instructions, input } = buildChatPrompt(question, passages);
  const response = await createOpenAIClient().responses.create({
    model: CHAT_MODEL,
    instructions,
    input,
    // No reasoning tokens: the task is reading comprehension, and they'd be billed.
    reasoning: { effort: "none" },
    temperature: ANSWER_TEMPERATURE,
    max_output_tokens: MAX_ANSWER_TOKENS,
    // Nothing to keep on OpenAI's side: every answer is a single turn.
    store: false,
  });

  const text = response.output_text.trim();
  if (text === "") {
    throw new ChatModelError(
      `No answer text (status ${response.status ?? "unknown"}, ${response.incomplete_details?.reason ?? "no reason"}).`,
    );
  }
  // The model was told to reply with exactly this; tidy minor variations (quotes, trailing space).
  return text.includes(I_DONT_KNOW_REPLY) ? I_DONT_KNOW_REPLY : text;
}
