import { chatRequestSchema, PLAN_LIMITS, type ChatResponse } from "@kivo/shared";
import { protectChat } from "../../../../lib/arcjet/protect";
import { generateAnswer } from "../../../../lib/chat/answer";
import {
  CHAT_HEADERS,
  CHAT_PREFLIGHT_HEADERS,
  MAX_CHAT_BODY_BYTES,
} from "../../../../lib/chat/http";
import { I_DONT_KNOW_REPLY, MATCH_COUNT } from "../../../../lib/chat/prompt";
import {
  consumeMessage,
  conversationInProject,
  ConversationGoneError,
  findProjectByKey,
  matchChunks,
  saveChatTurn,
} from "../../../../lib/chat/store";
import { embed } from "../../../../lib/openai/embed";
import { createServiceClient } from "../../../../lib/supabase/service";
import { widgetErrorResponse } from "../../../../lib/widget-config/http";

// POST /api/widget/chat — public, any origin (docs/project.md §6.6, §8, §9).
// Order matters: nothing reaches OpenAI or the quota before Arcjet and the
// project checks pass, and the quota is counted before any OpenAI call.
//
// Logs never contain the visitor's message, the reply or an error message
// (which could echo either): only the step and the error's name/code.

const FRIENDLY_ERROR = "Sorry, something went wrong. Please try again in a moment.";

export async function POST(request: Request): Promise<Response> {
  // 1. Validate the body.
  const body = await readJson(request);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return widgetErrorResponse("invalid_input", "Invalid chat request.");
  const { key, visitorId, conversationId, message } = parsed.data;

  // 2. Arcjet: rate limit + prompt injection. Blocked → never counted, never sent to OpenAI.
  const protection = await protectChat(request, { publicKey: key, message });
  if (!protection.allowed) {
    return protection.reason === "injection"
      ? widgetErrorResponse("message_blocked", "This message can't be answered.")
      : widgetErrorResponse("rate_limited", "Too many messages. Please wait a minute.");
  }

  let step = "lookup";
  try {
    const db = createServiceClient();

    // 3. The project, and the conversation if one is given. Unknown → 404, nothing counted.
    const project = await findProjectByKey(db, key);
    if (!project) return widgetErrorResponse("not_found", "Unknown widget key.");
    if (conversationId && !(await conversationInProject(db, project.id, conversationId))) {
      return widgetErrorResponse("not_found", "Unknown conversation.");
    }

    // 4. Count the message (plan read on the server). Over quota → no OpenAI call.
    step = "count";
    const limit = PLAN_LIMITS[project.plan].messagesPerMonth;
    if (!(await consumeMessage(db, project.id, limit))) {
      return widgetErrorResponse(
        "quota_exceeded",
        "This assistant has reached its message limit for the month.",
      );
    }

    // From here the message is counted: a failure is not refunded (§6.6 step 3).
    // 5. Retrieve.
    step = "embed";
    const [vector] = await embed([message]);
    if (!vector) throw new Error("No embedding.");
    step = "match";
    const passages = await matchChunks(db, project.id, vector, MATCH_COUNT);

    // 6–7. Answer: no passages → the fixed reply with no chat call.
    step = "answer";
    const reply =
      passages.length === 0 ? I_DONT_KNOW_REPLY : await generateAnswer(message, passages);

    // 8. Save and reply as plain text in JSON.
    step = "save";
    const savedId = await saveChatTurn(db, {
      projectId: project.id,
      conversationId,
      visitorId,
      message,
      reply,
    });
    const response: ChatResponse = { conversationId: savedId, reply };
    return Response.json(response, { headers: CHAT_HEADERS });
  } catch (err) {
    if (err instanceof ConversationGoneError) {
      return widgetErrorResponse("not_found", "Unknown conversation.");
    }
    console.error(`[api/widget/chat] ${step} failed: ${describe(err)}`);
    return widgetErrorResponse("internal", FRIENDLY_ERROR);
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CHAT_PREFLIGHT_HEADERS });
}

/** The parsed JSON body, or undefined if it's too big or not JSON. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_CHAT_BODY_BYTES || !request.body) return undefined;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CHAT_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return undefined;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    return undefined;
  } finally {
    reader.releaseLock();
  }
}

/** The error's name plus an HTTP status or DB code if it has one. Never its message. */
function describe(err: unknown): string {
  if (!(err instanceof Error)) return typeof err;
  const extra = err as { status?: unknown; code?: unknown };
  const detail =
    typeof extra.status === "number"
      ? ` ${extra.status}`
      : typeof extra.code === "string"
        ? ` ${extra.code}`
        : "";
  return `${err.name}${detail}`;
}
