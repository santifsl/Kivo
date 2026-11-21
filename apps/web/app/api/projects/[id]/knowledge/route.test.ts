import { apiErrorSchema, MAX_TEXT_SOURCE_LENGTH } from "@kivo/shared";
import type * as NextServer from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "../../../../../lib/projects/fake-postgrest";

// POST /api/projects/:id/knowledge. Real handler and supabase-js; Clerk,
// PostgREST/Storage (fetch), `after()` and `embed` are mocked.

vi.mock("server-only", () => ({}));

const captureImmediate = vi.hoisted(() => vi.fn());
vi.mock("../../../../../lib/posthog/server", () => ({
  getPosthogServer: () => ({ captureImmediate }),
}));

let userId: string | null = "user_a";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId, getToken: async () => (userId ? `token_${userId}` : null) }),
}));

/** Callbacks the route passed to `after()`; run them with `runAfter()`. */
const pending: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  after: (task: () => unknown) => {
    pending.push(task);
  },
}));
async function runAfter() {
  for (const task of pending.splice(0)) await task();
}

const embedMock = vi.fn<(texts: readonly string[]) => Promise<number[][]>>();
vi.mock("../../../../../lib/openai/embed", () => ({
  embed: (texts: readonly string[]) => embedMock(texts),
}));

const route = await import("./route");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const PUBLISHABLE = "sb_publishable_test_123";
const SECRET = "sb_secret_test_456";

const PROJECT = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const SOURCE = "1a2b3c4d-0000-4000-8000-000000000001";
const CREATED = "2026-11-21T00:00:00+00:00";

let pg: ReturnType<typeof fakePostgrest>;

beforeEach(() => {
  captureImmediate.mockReset();
  userId = "user_a";
  pending.length = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
  embedMock.mockReset();
  embedMock.mockImplementation(async (texts) => texts.map(() => Array<number>(1536).fill(0.5)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = (body: unknown, id = PROJECT) =>
  route.POST(
    new Request(`https://kivo.test/api/projects/${id}/knowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const TEXT = { title: "Returns", content: "Returns are free for 30 days." };

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(apiErrorSchema.parse(await res.json()).error.code).toBe(code);
}

/** The caller owns PROJECT (RLS returns it) and has `plan`. */
function owns(plan = "free") {
  pg.on("GET", "/rest/v1/projects", {
    body: [
      {
        id: PROJECT,
        name: "Site",
        public_key: "pk_test_abcdefgh",
        messages_used: 0,
        period_start: CREATED,
        created_at: CREATED,
      },
    ],
  });
  pg.on("GET", "/rest/v1/accounts", { body: [{ plan }] });
}

/** reserve_knowledge_source creates the source and reclaims `reclaimed`. */
function reserves(reclaimed: string[] = []) {
  pg.on("POST", "/rest/v1/rpc/reserve_knowledge_source", (req) => {
    const args = req.body as { p_project_id: string; p_title: string };
    return {
      body: {
        id: SOURCE,
        project_id: args.p_project_id,
        title: args.p_title,
        type: "text",
        storage_key: null,
        status: "processing",
        created_at: CREATED,
        reclaimed_storage_keys: reclaimed,
      },
    };
  });
}

/** Chunk and status writes succeed. */
function processingWrites() {
  pg.on("DELETE", "/rest/v1/knowledge_chunks", { body: null });
  pg.on("POST", "/rest/v1/knowledge_chunks", { status: 201, body: null });
  pg.on("PATCH", "/rest/v1/knowledge_sources", { body: [{ id: SOURCE }] });
}

const serviceRequests = () => pg.requests.filter((r) => r.headers.get("apikey") === SECRET);

describe("POST /api/projects/:id/knowledge", () => {
  it("signed out → 401, no database or OpenAI call", async () => {
    userId = null;
    await expectError(await post(TEXT), 401, "unauthorized");
    expect(pg.requests).toHaveLength(0);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("another owner's project → 404, with no service-client or OpenAI call", async () => {
    pg.on("GET", "/rest/v1/projects", { body: [] }); // RLS hides it
    await expectError(await post(TEXT), 404, "not_found");

    expect(pg.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /rest/v1/projects"]);
    const [read] = pg.requests;
    expect(read?.headers.get("authorization")).toBe("Bearer token_user_a");
    expect(read?.params.get("id")).toBe(`eq.${PROJECT}`);
    expect(serviceRequests()).toHaveLength(0);
    expect(pending).toHaveLength(0);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("a malformed project id → 404, no database call", async () => {
    await expectError(await post(TEXT, "not-a-uuid"), 404, "not_found");
    expect(pg.requests).toHaveLength(0);
  });

  it.each([
    ["no title", { content: "x" }],
    ["blank title", { title: "  ", content: "x" }],
    ["blank content", { title: "T", content: " \n " }],
    ["content too long", { title: "T", content: "x".repeat(MAX_TEXT_SOURCE_LENGTH + 1) }],
    ["an extra field (e.g. a client-sent plan)", { ...TEXT, plan: "pro" }],
    ["not JSON", "{oops"],
  ])("invalid body (%s) → 400, nothing reserved", async (_, body) => {
    owns();
    await expectError(await post(body), 400, "invalid_input");
    expect(serviceRequests()).toHaveLength(0);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it.each([
    ["free", 3],
    ["pro", 25],
  ])("passes the %s plan's limit, read from the database", async (plan, limit) => {
    owns(plan);
    reserves();
    expect((await post(TEXT)).status).toBe(201);
    const [rpc] = pg.to("/rest/v1/rpc/reserve_knowledge_source");
    expect(rpc?.body).toEqual({
      p_project_id: PROJECT,
      p_title: "Returns",
      p_type: "text",
      p_status: "processing",
      p_max_sources: limit,
    });
    expect(rpc?.headers.get("apikey")).toBe(SECRET);
    // The plan read used the owner client.
    expect(pg.to("/rest/v1/accounts")[0]?.headers.get("authorization")).toBe("Bearer token_user_a");
  });

  it("4th source on Free → 403 plan_limit, no processing", async () => {
    owns("free");
    pg.on(
      "POST",
      "/rest/v1/rpc/reserve_knowledge_source",
      pgError("KV005", "knowledge_limit: the plan allows 3 source(s) per project"),
    );
    await expectError(await post(TEXT), 403, "plan_limit");
    expect(pending).toHaveLength(0);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("project deleted between the check and the reserve → 404", async () => {
    owns();
    pg.on("POST", "/rest/v1/rpc/reserve_knowledge_source", pgError("KV004", "project_not_found"));
    await expectError(await post(TEXT), 404, "not_found");
  });

  it("database error → 500 without the error text", async () => {
    owns();
    pg.on("POST", "/rest/v1/rpc/reserve_knowledge_source", pgError("XX000", "db.secret-host", 500));
    const res = await post(TEXT);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret-host");
  });

  it("→ 201 processing, then processes after the response: chunks + ready", async () => {
    owns();
    reserves();
    processingWrites();

    const res = await post({ title: "  Returns ", content: TEXT.content });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      source: {
        id: SOURCE,
        project_id: PROJECT,
        title: "Returns",
        type: "text",
        storage_key: null,
        status: "processing",
        created_at: CREATED,
      },
    });
    // Nothing embedded before the response.
    expect(embedMock).not.toHaveBeenCalled();
    expect(pending).toHaveLength(1);
    expect(captureImmediate).not.toHaveBeenCalled();

    await runAfter();
    expect(embedMock).toHaveBeenCalledWith([TEXT.content]);
    const [insert] = pg.to("/rest/v1/knowledge_chunks", "POST");
    expect(insert?.body).toEqual([
      expect.objectContaining({ source_id: SOURCE, project_id: PROJECT, content: TEXT.content }),
    ]);
    const [status] = pg.to("/rest/v1/knowledge_sources", "PATCH");
    expect(status?.body).toEqual({ status: "ready" });
    expect(status?.params.get("id")).toBe(`eq.${SOURCE}`);
    expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_a",
      event: "knowledge_added",
      properties: { project_id: PROJECT },
    });
  });

  it("processing failure → failed, no chunks", async () => {
    owns();
    reserves();
    processingWrites();
    embedMock.mockRejectedValue(new Error("429 no credits"));

    expect((await post(TEXT)).status).toBe(201);
    await runAfter();
    expect(pg.to("/rest/v1/knowledge_chunks", "POST")).toHaveLength(0);
    expect(pg.to("/rest/v1/knowledge_sources", "PATCH").map((r) => r.body)).toEqual([
      { status: "failed" },
    ]);
    expect(captureImmediate).not.toHaveBeenCalled();
  });

  it("deletes reclaimed upload files through the Storage API", async () => {
    owns();
    const stale = [`${PROJECT}/aaaa.pdf`, `${PROJECT}/bbbb.md`];
    reserves(stale);
    pg.on("DELETE", "/storage/v1/object/knowledge", { body: [] });

    expect((await post(TEXT)).status).toBe(201);
    const [remove] = pg.to("/storage/v1/object/knowledge", "DELETE");
    expect(remove?.body).toEqual({ prefixes: stale });
    expect(remove?.headers.get("apikey")).toBe(SECRET);
  });

  it("no Storage call when nothing was reclaimed", async () => {
    owns();
    reserves();
    expect((await post(TEXT)).status).toBe(201);
    expect(pg.requests.some((r) => r.path.startsWith("/storage/"))).toBe(false);
  });

  it("a Storage failure on reclaimed files still creates the source", async () => {
    owns();
    reserves([`${PROJECT}/aaaa.pdf`]);
    pg.on("DELETE", "/storage/v1/object/knowledge", { status: 500, body: { message: "down" } });
    expect((await post(TEXT)).status).toBe(201);
    expect(pending).toHaveLength(1);
  });
});
