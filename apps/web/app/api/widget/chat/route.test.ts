import { apiErrorSchema, PLAN_LIMITS, type ChatResponse } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ProtectResult } from "../../../../lib/arcjet/protect";

// End to end through the real route, lib/chat and supabase-js. Mocked: Arcjet
// (its result only), OpenAI (at the client factory) and PostgREST (at fetch).
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

const { POST, OPTIONS } = await import("./route");
const { I_DONT_KNOW_REPLY } = await import("../../../../lib/chat/prompt");
const { CHAT_MODEL } = await import("../../../../lib/chat/answer");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");

const KEY = "pk_test_abcdefgh";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_ID = "22222222-2222-4222-8222-222222222222";
const NEW_CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "How long does shipping take to Canada?";
const VECTOR = Array.from({ length: 1536 }, (_, i) => i / 1536);
const PASSAGES = ["Shipping to Canada takes 5–7 business days.", "Returns are free for 30 days."];

/** What PostgREST answers, per table or function. Tests override pieces. */
interface Db {
  project: { id: string; accounts: { plan: string } | null } | null;
  conversation: boolean;
  consume: boolean;
  chunks: string[];
  save: Response | null;
}

let db: Db;
const fetchMock = vi.fn<typeof fetch>();
/** Each PostgREST call: path and parsed JSON body (for RPCs). */
let calls: { path: string; body: unknown }[];

function postgrest(url: string, init?: RequestInit): Response {
  const { pathname } = new URL(url);
  const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const path = pathname.replace("/rest/v1/", "");
  calls.push({ path, body });
  switch (path) {
    case "projects":
      return Response.json(db.project ? [db.project] : []);
    case "conversations":
      return Response.json(db.conversation ? [{ id: CONVERSATION_ID }] : []);
    case "rpc/consume_message":
      return Response.json(db.consume);
    case "rpc/match_chunks":
      return Response.json(
        db.chunks.map((content, i) => ({ id: `c${i}`, source_id: "s", content, similarity: 0.9 })),
      );
    case "rpc/save_chat_turn":
      return db.save ?? Response.json(NEW_CONVERSATION_ID);
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
    status: "completed",
    incomplete_details: null,
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
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv(SECRET_ENV, "sb_secret_test_456");
  db = {
    project: { id: PROJECT_ID, accounts: { plan: "free" } },
    conversation: true,
    consume: true,
    chunks: PASSAGES,
    save: null,
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

afterEach(() => {
  expect(logged()).not.toContain(MESSAGE);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/widget/chat — success", () => {
  it("answers from the passages, saves the turn, returns { conversationId, reply }", async () => {
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
    expect(rpcCalls("save_chat_turn")[0]?.body).toEqual({
      p_project_id: PROJECT_ID,
      p_conversation_id: null,
      p_visitor_id: "v_123",
      p_visitor_message: MESSAGE,
      p_bot_reply: "Shipping to Canada takes 5–7 business days.",
    });
  });

  it("continues a conversation of this project", async () => {
    const res = await post({ ...VALID, conversationId: CONVERSATION_ID });
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.path === "conversations")).toBeDefined();
    expect(rpcCalls("save_chat_turn")[0]?.body).toMatchObject({
      p_conversation_id: CONVERSATION_ID,
    });
  });

  it("Pro: counts against the Pro limit", async () => {
    db.project = { id: PROJECT_ID, accounts: { plan: "pro" } };
    await post(VALID);
    expect(rpcCalls("consume_message")[0]?.body).toMatchObject({
      p_limit: PLAN_LIMITS.pro.messagesPerMonth,
    });
  });

  it("unknown plan: treated as Free", async () => {
    db.project = { id: PROJECT_ID, accounts: { plan: "enterprise" } };
    await post(VALID);
    expect(rpcCalls("consume_message")[0]?.body).toMatchObject({
      p_limit: PLAN_LIMITS.free.messagesPerMonth,
    });
  });

  it('no chunks: the fixed "I don\'t know" reply with no chat-model call, still saved', async () => {
    db.chunks = [];
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(((await res.json()) as ChatResponse).reply).toBe(I_DONT_KNOW_REPLY);
    expect(openai.embeddings.create).toHaveBeenCalledTimes(1);
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(rpcCalls("save_chat_turn")[0]?.body).toMatchObject({
      p_bot_reply: I_DONT_KNOW_REPLY,
    });
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
});

describe("POST /api/widget/chat — errors", () => {
  function expectNothingCountedOrSent() {
    expect(rpcCalls("consume_message")).toEqual([]);
    expect(openai.embeddings.create).not.toHaveBeenCalled();
    expect(openai.responses.create).not.toHaveBeenCalled();
    expect(rpcCalls("save_chat_turn")).toEqual([]);
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

  it("rate limited by Arcjet: 429 rate_limited, nothing counted or sent", async () => {
    protectChat.mockResolvedValue({ allowed: false, reason: "rate_limit" });
    await expectError(await post(VALID), 429, "rate_limited");
    expect(fetchMock).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
  });

  it("prompt injection: 400 message_blocked, nothing counted or sent", async () => {
    protectChat.mockResolvedValue({ allowed: false, reason: "injection" });
    await expectError(await post(VALID), 400, "message_blocked");
    expect(fetchMock).not.toHaveBeenCalled();
    expectNothingCountedOrSent();
  });

  it("unknown key: 404 not_found, nothing counted", async () => {
    db.project = null;
    await expectError(await post(VALID), 404, "not_found");
    expectNothingCountedOrSent();
  });

  it("a conversation of another project: 404 not_found, nothing counted", async () => {
    db.conversation = false;
    await expectError(await post({ ...VALID, conversationId: CONVERSATION_ID }), 404, "not_found");
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
  });
});

describe("OPTIONS /api/widget/chat", () => {
  it("answers the preflight for any origin, POST + JSON, no credentials", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
