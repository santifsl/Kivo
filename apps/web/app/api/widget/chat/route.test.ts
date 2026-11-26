import { apiErrorSchema, PLAN_LIMITS, type ChatResponse } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ProtectResult } from "../../../../lib/arcjet/protect";

// End to end through the real route, lib/chat and supabase-js. Mocked: Arcjet
// (its result only), OpenAI and PostHog (at their clients), and PostgREST (at fetch).
vi.mock("server-only", () => ({}));

const protectChat = vi.hoisted(() =>
  vi.fn<
    (request: Request, input: { publicKey: string; message: string }) => Promise<ProtectResult>
  >(),
);
vi.mock("../../../../lib/arcjet/protect", () => ({ protectChat }));

const openai = vi.hoisted(() => ({
  embeddings: { create: vi.fn() },
  responses: { create: vi.fn() },
}));
vi.mock("../../../../lib/openai/client", () => ({ createOpenAIClient: () => openai }));

const { after, captureImmediate, captureAiImmediate, getPosthogServer } = vi.hoisted(() => ({
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  captureImmediate: vi.fn(),
  captureAiImmediate: vi.fn(),
  getPosthogServer: vi.fn(),
}));
vi.mock("next/server", () => ({ after }));
vi.mock("../../../../lib/posthog/server", () => ({ getPosthogServer }));

const { POST, OPTIONS } = await import("./route");
const { I_DONT_KNOW_REPLY } = await import("../../../../lib/chat/prompt");
const { CHAT_MODEL } = await import("../../../../lib/chat/answer");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");

const KEY = "pk_test_abcdefgh";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const OWNER_ID = "user_owner";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const NEW_CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";
const FIRST_CHAT_AT = "2026-11-21T23:59:59.123+00:00";
const MESSAGE = "How long does shipping take to Canada?";
const VECTOR = Array.from({ length: 1536 }, (_, i) => i / 1536);
const PASSAGES = ["Shipping to Canada takes 5–7 business days.", "Returns are free for 30 days."];

/** What PostgREST answers, per table or function. Tests override pieces. */
interface Db {
  project: { id: string; owner_id: string; accounts: { plan: string } | null };
  conversationProjectId: string;
  consume: boolean;
  chunks: string[];
  save: Response | null;
  firstChatAt: string | null;
}

let db: Db;
const fetchMock = vi.fn<typeof fetch>();
/** Each PostgREST call: path and parsed JSON body (for RPCs). */
let calls: { path: string; body: unknown }[];

function postgrest(url: string, init?: RequestInit): Response {
  const { pathname, searchParams } = new URL(url);
  const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const path = pathname.replace("/rest/v1/", "");
  calls.push({ path, body });
  switch (path) {
    case "projects":
      return Response.json(searchParams.get("public_key") === `eq.${KEY}` ? [db.project] : []);
    case "conversations":
      return Response.json(
        searchParams.get("id") === `eq.${CONVERSATION_ID}` &&
          searchParams.get("project_id") === `eq.${db.conversationProjectId}`
          ? [{ id: CONVERSATION_ID }]
          : [],
      );
    case "rpc/consume_message":
      return Response.json(db.consume);
    case "rpc/match_chunks":
      return Response.json(
        db.chunks.map((content, i) => ({ id: `c${i}`, source_id: "s", content, similarity: 0.9 })),
      );
    case "rpc/save_chat_turn_with_first_chat":
      return (
        db.save ??
        Response.json({
          conversation_id: NEW_CONVERSATION_ID,
          first_chat_at: db.firstChatAt,
        })
      );
    case "rpc/save_chat_turn":
      return Response.json(NEW_CONVERSATION_ID);
    default:
      throw new Error(`Unexpected PostgREST call: ${path}`);
  }
}

function rpcCalls(name: string) {
  return calls.filter((c) => c.path === `rpc/${name}`);
}

function post(body: unknown, init: RequestInit = {}): Promise<Response> {
  return POST(
    new Request("https://kivo.test/api/widget/chat", {
      method: "POST",
      headers: { Origin: "https://example.com", "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }),
  );
}

const VALID = { key: KEY, visitorId: "v_123", message: MESSAGE };

function expectRouteHeaders(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  expect(res.headers.get("cache-control")).toBe("no-store");
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expectRouteHeaders(res);
  const body = apiErrorSchema.parse(await res.json());
  expect(body.error.code).toBe(code);
  return body;
}

function modelAnswers(text: string) {
  openai.responses.create.mockResolvedValue({
    output_text: text,
    model: CHAT_MODEL,
    service_tier: "default",
    status: "completed",
    incomplete_details: null,
    usage: {
      input_tokens: 1_000,
      input_tokens_details: { cached_tokens: 400 },
      output_tokens: 200,
    },
  });
}

let errorLog: MockInstance<typeof console.error>;
let warnLog: MockInstance<typeof console.warn>;

/** Every console line: must never contain the visitor's message or the reply. */
function logged(): string {
  return [...errorLog.mock.calls, ...warnLog.mock.calls]
    .map((c) => c.map(String).join(" "))
    .join("\n");
}

beforeEach(() => {
  after.mockReset();
  captureImmediate.mockReset();
  captureAiImmediate.mockReset();
  getPosthogServer.mockReset().mockReturnValue({ captureImmediate, captureAiImmediate });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv(SECRET_ENV, "sb_secret_test_456");
  db = {
    project: { id: PROJECT_ID, owner_id: OWNER_ID, accounts: { plan: "free" } },
    conversationProjectId: PROJECT_ID,
    consume: true,
    chunks: PASSAGES,
    save: null,
    firstChatAt: null,
  };
  calls = [];
  fetchMock.mockReset().mockImplementation(async (input, init) => postgrest(String(input), init));
  vi.stubGlobal("fetch", fetchMock);
  protectChat.mockReset().mockResolvedValue({ allowed: true });
  openai.embeddings.create
    .mockReset()
    .mockResolvedValue({ data: [{ index: 0, embedding: VECTOR }] });
  openai.responses.create.mockReset();
  modelAnswers("Shipping to Canada takes 5–7 business days.");
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function runAfter() {
  await Promise.all(after.mock.calls.map(([callback]) => callback()));
}

afterEach(() => {
  expect(logged()).not.toContain(MESSAGE);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/widget/chat — success", () => {
  it("answers from the passages, saves the turn, returns { conversationId, reply }", async () => {
    db.firstChatAt = FIRST_CHAT_AT;
    const res = await post(VALID);

    expect(res.status).toBe(200);
    expectRouteHeaders(res);
    const body = (await res.json()) as ChatResponse;
    expect(body).toEqual({
      conversationId: NEW_CONVERSATION_ID,
      reply: "Shipping to Canada takes 5–7 business days.",
    });

    // Arcjet saw the key and the message.
    expect(protectChat).toHaveBeenCalledWith(expect.any(Request), {
      publicKey: KEY,
      message: MESSAGE,
    });
    // Counted with the plan's limit, read on the server.
    expect(rpcCalls("consume_message")[0]?.body).toEqual({
      p_project_id: PROJECT_ID,
      p_limit: PLAN_LIMITS.free.messagesPerMonth,
    });
    // Embedded the question, then top 5 in this project.
    expect(openai.embeddings.create).toHaveBeenCalledWith(
      expect.objectContaining({ input: [MESSAGE] }),
    );
    expect(rpcCalls("match_chunks")[0]?.body).toEqual({
      p_project_id: PROJECT_ID,
      p_embedding: JSON.stringify(VECTOR),
      p_count: 5,
    });
    // The chat model got the passages and the question, cheaply configured.
    const [params] = openai.responses.create.mock.calls[0] ?? [];
    expect(params).toMatchObject({
      model: CHAT_MODEL,
      reasoning: { effort: "none" },
      max_output_tokens: 300,
      store: false,
    });
    expect((params as { input: string }).input).toContain(PASSAGES[0]);
    expect((params as { input: string }).input).toContain(MESSAGE);
    // A new conversation: null id.
    expect(rpcCalls("save_chat_turn_with_first_chat")[0]?.body).toEqual({
      p_project_id: PROJECT_ID,
      p_conversation_id: null,
      p_visitor_id: "v_123",
      p_visitor_message: MESSAGE,
      p_bot_reply: "Shipping to Canada takes 5–7 business days.",
    });
    expect(captureAiImmediate).not.toHaveBeenCalled();
    await runAfter();
    expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
      distinctId: OWNER_ID,
      event: "first_chat",
      uuid: PROJECT_ID,
      timestamp: new Date(FIRST_CHAT_AT),
      properties: { project_id: PROJECT_ID },
    });
    expect(captureAiImmediate).toHaveBeenCalledExactlyOnceWith({
      distinctId: OWNER_ID,
      event: "$ai_generation",
      properties: {
        project_id: PROJECT_ID,
        $ai_trace_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
        $ai_session_id: NEW_CONVERSATION_ID,
        $ai_model: CHAT_MODEL,
        $ai_provider: "openai",
        $ai_latency: expect.any(Number),
        $ai_input_tokens: 1000,
        $ai_cache_read_input_tokens: 400,
        $ai_output_tokens: 200,
        $ai_input_cost_usd: expect.closeTo(0.000064, 9),
        $ai_output_cost_usd: expect.closeTo(0.0001, 9),
        $ai_total_cost_usd: expect.closeTo(0.000164, 9),
      },
    });
  });

  it("continues a conversation of this project", async () => {
    const res = await post({ ...VALID, conversationId: CONVERSATION_ID });
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.path === "conversations")).toBeDefined();
    expect(rpcCalls("save_chat_turn_with_first_chat")[0]?.body).toMatchObject({
      p_conversation_id: CONVERSATION_ID,
    });
    await runAfter();
    expect(captureImmediate).not.toHaveBeenCalled();
  });

  it("Pro: counts against the Pro limit", async () => {
    db.project = { id: PROJECT_ID, owner_id: OWNER_ID, accounts: { plan: "pro" } };
    await post(VALID);
    expect(rpcCalls("consume_message")[0]?.body).toMatchObject({
      p_limit: PLAN_LIMITS.pro.messagesPerMonth,
    });
  });

  it("unknown plan: treated as Free", async () => {
    db.project = { id: PROJECT_ID, owner_id: OWNER_ID, accounts: { plan: "enterprise" } };
    await post(VALID);
    expect(rpcCalls("consume_message")[0]?.body).toMatchObject({
      p_limit: PLAN_LIMITS.free.messagesPerMonth,
    });
  });

  it('no chunks: the fixed "I don\'t know" reply with no chat-model call, still saved', async () => {
    db.chunks = [];
    db.firstChatAt = FIRST_CHAT_AT;
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(((await res.json()) as ChatResponse).reply).toBe(I_DONT_KNOW_REPLY);
    expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(rpcCalls("save_chat_turn_with_first_chat")[0]?.body).toMatchObject({
      p_bot_reply: I_DONT_KNOW_REPLY,
    });
    await runAfter();
    expect(captureAiImmediate).not.toHaveBeenCalled();
    expect(captureImmediate).toHaveBeenCalledOnce();
  });

  it("the model's \"I don't know\" is normalized to the fixed text", async () => {
    modelAnswers(`"${I_DONT_KNOW_REPLY}"`);
    const res = await post(VALID);
    expect(((await res.json()) as ChatResponse).reply).toBe(I_DONT_KNOW_REPLY);
  });

  it("the reply is returned as plain text, as given (never HTML-processed)", async () => {
    modelAnswers("Use <b>5–7</b> days & ask us.");
    const res = await post(VALID);
    expect(((await res.json()) as ChatResponse).reply).toBe("Use <b>5–7</b> days & ask us.");
  });

  it("returns the saved reply even when telemetry is rejected", async () => {
    captureAiImmediate.mockRejectedValueOnce(new Error("PostHog unavailable"));
    const res = await post(VALID);

    expect(res.status).toBe(200);
    await expect(runAfter()).resolves.toBeUndefined();
    expect(captureAiImmediate).toHaveBeenCalledOnce();
    expect((await res.json()).conversationId).toBe(NEW_CONVERSATION_ID);
  });

  it("keeps the real generation metadata without estimating missing token usage", async () => {
    openai.responses.create.mockResolvedValueOnce({ output_text: "Hello.", model: CHAT_MODEL });
    expect((await post(VALID)).status).toBe(200);

    await runAfter();
    expect(captureAiImmediate.mock.calls[0]?.[0].properties).toMatchObject({
      $ai_model: CHAT_MODEL,
      $ai_latency: expect.any(Number),
    });
    expect(captureAiImmediate.mock.calls[0]?.[0].properties).not.toHaveProperty("$ai_input_tokens");
    expect(captureAiImmediate.mock.calls[0]?.[0].properties).not.toHaveProperty(
      "$ai_total_cost_usd",
    );
  });

  it("falls back only when PostgREST reports the new RPC missing and omits first_chat", async () => {
    db.save = Response.json({ code: "PGRST202", message: "Missing RPC" }, { status: 404 });

    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(rpcCalls("save_chat_turn_with_first_chat")[0]?.body).toEqual(
      rpcCalls("save_chat_turn")[0]?.body,
    );
    expect(rpcCalls("save_chat_turn")).toHaveLength(1);
    await runAfter();
    expect(captureImmediate).not.toHaveBeenCalled();
    expect(captureAiImmediate).toHaveBeenCalledOnce();
  });
});

describe("POST /api/widget/chat — errors", () => {
  function expectNothingCountedOrSent() {
    expect(rpcCalls("consume_message")).toEqual([]);
    expect(openai.embeddings.create).not.toHaveBeenCalled();
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(rpcCalls("save_chat_turn")).toEqual([]);
    expect(rpcCalls("save_chat_turn_with_first_chat")).toEqual([]);
  }

  it.each([
    ["not JSON", "{nope"],
    ["no key", { visitorId: "v", message: "Hi" }],
    ["a bad key", { ...VALID, key: "nope" }],
    ["an empty message", { ...VALID, message: "   " }],
    ["a 1,001-character message", { ...VALID, message: "x".repeat(1001) }],
    ["a bad conversation id", { ...VALID, conversationId: "abc" }],
    ["an extra field", { ...VALID, plan: "pro" }],
  ])("%s: 400 invalid_input, before Arcjet", async (_, body) => {
    await expectError(await post(body), 400, "invalid_input");
    expect(protectChat).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
  });

  it("a body over 16 KB: 400 invalid_input", async () => {
    await expectError(await post({ ...VALID, pad: "x".repeat(17_000) }), 400, "invalid_input");
    expect(protectChat).not.toHaveBeenCalled();
  });

  it("stops reading a streamed body as soon as it passes 16 KiB", async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (chunks++ < 2) controller.enqueue(new Uint8Array(10 * 1024));
          else controller.close();
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const init = { body, duplex: "half" } as const;

    await expectError(await post(VALID, init), 400, "invalid_input");
    expect(chunks).toBe(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(protectChat).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
  });

  it("rate limited by Arcjet: 429 rate_limited, nothing counted or sent", async () => {
    protectChat.mockResolvedValue({ allowed: false, reason: "rate_limit" });
    await expectError(await post(VALID), 429, "rate_limited");
    expect(fetchMock).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
    await runAfter();
    expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
      event: "message_blocked",
      properties: { reason: "rate_limit" },
    });
  });

  it("prompt injection: 400 message_blocked, nothing counted or sent", async () => {
    protectChat.mockResolvedValue({ allowed: false, reason: "injection" });
    await expectError(await post(VALID), 400, "message_blocked");
    expect(fetchMock).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
    await runAfter();
    expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
      event: "message_blocked",
      properties: { reason: "injection" },
    });
  });

  it("unknown key: 404 not_found, nothing counted", async () => {
    await expectError(await post({ ...VALID, key: "pk_test_unknown" }), 404, "not_found");
    expectNothingCountedOrSent();
  });

  it("a conversation of another project: 404 not_found, nothing counted", async () => {
    db.conversationProjectId = OTHER_PROJECT_ID;
    await expectError(await post({ ...VALID, conversationId: CONVERSATION_ID }), 404, "not_found");
    expect(after).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
  });

  it("quota used up: 429 quota_exceeded, no OpenAI call", async () => {
    db.consume = false;
    await expectError(await post(VALID), 429, "quota_exceeded");
    expect(rpcCalls("consume_message")).toHaveLength(1);
    expect(openai.embeddings.create).not.toHaveBeenCalled();
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(rpcCalls("save_chat_turn")).toEqual([]);
  });

  it("chat model error: counted (no refund), 500 internal with a friendly message, logged without text", async () => {
    openai.responses.create.mockRejectedValue(
      Object.assign(new Error(`upstream failed for ${MESSAGE}`), { name: "APIError", status: 503 }),
    );
    const body = await expectError(await post(VALID), 500, "internal");
    expect(body.error.message).toMatch(/try again/i);
    expect(rpcCalls("consume_message")).toHaveLength(1);
    expect(rpcCalls("save_chat_turn")).toEqual([]);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(logged()).toBe("[api/widget/chat] answer failed: APIError 503");
  });

  it("model returns no text: counted, 500 internal", async () => {
    openai.responses.create.mockResolvedValue({
      output_text: "",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });
    await expectError(await post(VALID), 500, "internal");
    expect(rpcCalls("consume_message")).toHaveLength(1);
    expect(logged()).toBe("[api/widget/chat] answer failed: ChatModelError");
  });

  it("embedding error: counted, 500 internal", async () => {
    openai.embeddings.create.mockRejectedValue(
      Object.assign(new Error("boom"), { name: "APIError", status: 429 }),
    );
    await expectError(await post(VALID), 500, "internal");
    expect(rpcCalls("consume_message")).toHaveLength(1);
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(logged()).toBe("[api/widget/chat] embed failed: APIError 429");
  });

  it("database error: 500 internal, logged with the code only", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { code: "XX000", message: `db.secret-host failed: ${MESSAGE}` },
        { status: 500 },
      ),
    );
    const res = await post(VALID);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("secret-host");
    expect(logged()).toBe("[api/widget/chat] lookup failed: ChatStoreError XX000");
  });

  it("conversation deleted before the save (KV003): 404 not_found", async () => {
    db.save = Response.json(
      { code: "KV003", message: "conversation_not_found: x" },
      { status: 400 },
    );
    await expectError(await post({ ...VALID, conversationId: CONVERSATION_ID }), 404, "not_found");
    expect(after).not.toHaveBeenCalled();
    expect(rpcCalls("save_chat_turn")).toEqual([]);
  });
});

describe("OPTIONS /api/widget/chat", () => {
  it("answers the preflight for any origin, POST + JSON, without running chat", async () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expectRouteHeaders(res);
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
    expect(await res.text()).toBe("");
    expect(protectChat).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openai.embeddings.create).not.toHaveBeenCalled();
  });
});
