import {
  apiErrorSchema,
  idSchema,
  type ApiErrorCode,
  type ChatRequest,
  type ChatResponse,
} from "@kivo/shared";

type ChatResult = { ok: true; data: ChatResponse } | { ok: false; error: string };

const SEND_ERROR = "Sorry, something went wrong. Please try again.";
const sendErrors: Partial<Record<ApiErrorCode, string>> = {
  rate_limited: "Too many messages. Please wait a minute before trying again.",
  quota_exceeded: "This assistant has reached its message limit for the month.",
  message_blocked: "This message couldn't be answered. Try asking a different question.",
};

export async function sendChatMessage(request: ChatRequest): Promise<ChatResult> {
  try {
    const response = await fetch("/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      return {
        ok: false,
        error: (error.success && sendErrors[error.data.error.code]) || SEND_ERROR,
      };
    }

    // The shared success contract is a type. Check both fields before updating chat state.
    const reply = body as Partial<ChatResponse> | null;
    const conversationId = idSchema.safeParse(reply?.conversationId);
    if (conversationId.success && typeof reply?.reply === "string") {
      return { ok: true, data: { conversationId: conversationId.data, reply: reply.reply } };
    }
  } catch {
    // A network failure or non-JSON response uses the same friendly fallback.
  }
  return { ok: false, error: SEND_ERROR };
}
