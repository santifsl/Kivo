import { apiErrorSchema, type Message } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "../projects/fake-postgrest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ userId: "user_owner" as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: auth.userId,
    getToken: async () => (auth.userId ? `token_${auth.userId}` : null),
  }),
}));

import { GET as getThread } from "../../app/api/conversations/[id]/route";
import { GET as listThreads } from "../../app/api/projects/[id]/conversations/route";

const PROJECT = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const MISSING = "9f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const AT = "2026-11-19T00:00:00.123456+00:00";
const PUBLISHABLE = "sb_publishable_test_123";
const PROJECTS = "/rest/v1/projects";
const CONVERSATIONS = "/rest/v1/conversations";
const MESSAGES = "/rest/v1/messages";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const conversation = { id: id(1), project_id: PROJECT, visitor_id: "visitor-1", created_at: AT };

let pg: ReturnType<typeof fakePostgrest>;

beforeEach(() => {
  auth.userId = "user_owner";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const list = (id = PROJECT) =>
  listThreads(new Request(`https://kivo.test/api/projects/${id}/conversations`), {
    params: Promise.resolve({ id }),
  });
const thread = (id = conversation.id) =>
  getThread(new Request(`https://kivo.test/api/conversations/${id}`), {
    params: Promise.resolve({ id }),
  });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = await res.json();
  expect(apiErrorSchema.parse(body).error.code).toBe(code);
  return body;
}

describe.each([
  { call: list, path: PROJECTS, ownedId: PROJECT },
  { call: thread, path: CONVERSATIONS, ownedId: conversation.id },
])("owner guard for $path", ({ call, path, ownedId }) => {
  it("returns 401 before querying for a signed-out caller", async () => {
    auth.userId = null;
    await expectError(await call(), 401, "unauthorized");
    expect(pg.requests).toHaveLength(0);
  });

  it("returns 404 before querying for an invalid id", async () => {
    await expectError(await call("invalid"), 404, "not_found");
    expect(pg.requests).toHaveLength(0);
  });

  it("returns identical 404s for missing and RLS-hidden IDs", async () => {
    auth.userId = "user_other";
    pg.on("GET", path, ({ headers }) => {
      expect(headers.get("authorization")).toBe("Bearer token_user_other");
      expect(headers.get("apikey")).toBe(PUBLISHABLE);
      return { body: [] };
    });

    const missing = await expectError(await call(MISSING), 404, "not_found");
    expect(await expectError(await call(ownedId), 404, "not_found")).toEqual(missing);
    expect(pg.requests.map(({ path }) => path)).toEqual([path, path]);
  });

  it("returns a generic 500 when PostgREST fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    pg.on("GET", path, pgError("TEST", "private error detail"));
    const body = await expectError(await call(), 500, "internal");
    expect(body).toEqual({ error: { code: "internal", message: "Something went wrong." } });
  });
});

describe("GET /api/projects/:id/conversations", () => {
  it("returns an empty list for an owned project with no conversations", async () => {
    pg.on("GET", PROJECTS, { body: [{ id: PROJECT }] });
    pg.on("GET", CONVERSATIONS, { body: [] });
    expect(await (await list()).json()).toEqual({ conversations: [] });
    expect(pg.to(MESSAGES)).toHaveLength(0);
  });

  it("requests newest-first previews and counts across conversations in batches", async () => {
    const body = "🙂".repeat(121);
    pg.on("GET", PROJECTS, { body: [{ id: PROJECT }] });
    pg.on("GET", CONVERSATIONS, ({ params }) => {
      expect(Object.fromEntries(params)).toMatchObject({
        project_id: `eq.${PROJECT}`,
        order: "created_at.desc,id.desc",
        "first_visitor.role": "eq.visitor",
        "first_visitor.order": "created_at.asc,id.asc",
        "first_visitor.limit": "1",
      });
      return {
        body: [
          { id: id(2), visitor_id: "visitor-2", created_at: AT, first_visitor: [{ body }] },
          { id: id(1), visitor_id: "visitor-1", created_at: AT, first_visitor: [] },
        ],
      };
    });
    const rows = Array.from({ length: 500 }, (_, index) => ({
      id: id(index + 1),
      conversation_id: id(2),
    }));
    pg.on("GET", MESSAGES, ({ params }) => {
      expect(params.get("conversations.project_id")).toBe(`eq.${PROJECT}`);
      expect(params.get("select")).toBe("id,conversation_id,conversations!inner()");
      expect(params.get("order")).toBe("id.asc");
      const cursor = params.get("id");
      if (cursor === null) return { body: rows };
      expect(cursor).toBe(`gt.${id(500)}`);
      return { body: [{ id: id(501), conversation_id: id(2) }] };
    });

    const res = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      conversations: [
        {
          id: id(2),
          visitor_id: "visitor-2",
          created_at: AT,
          preview: `${"🙂".repeat(119)}…`,
          message_count: 501,
        },
        { id: id(1), visitor_id: "visitor-1", created_at: AT, preview: "", message_count: 0 },
      ],
    });
    expect(pg.to(MESSAGES)).toHaveLength(2);
  });
});

describe("GET /api/conversations/:id", () => {
  it("returns the full oldest-first thread across a tied timestamp at the page boundary", async () => {
    // Phase 3's thread fixture begins with the seeded visitor's "Hi",
    // followed by saved visitor/bot turns (Q1/A1, Q2/A2, ...).
    const messages = Array.from({ length: 501 }, (_, index): Message => ({
      id: id(index + 1),
      conversation_id: conversation.id,
      role: index % 2 === 0 ? "visitor" : "bot",
      body: index === 0 ? "Hi" : `Message ${index}`,
      created_at: AT,
    }));
    pg.on("GET", CONVERSATIONS, ({ params }) => {
      expect(params.get("id")).toBe(`eq.${conversation.id}`);
      return { body: [conversation] };
    });
    pg.on("GET", MESSAGES, ({ params }) => {
      expect(params.get("conversation_id")).toBe(`eq.${conversation.id}`);
      expect(params.get("order")).toBe("created_at.asc,id.asc");
      const cursor = params.get("or");
      if (cursor === null) return { body: messages.slice(0, 500) };
      expect(cursor).toBe(`(created_at.gt.${AT},and(created_at.eq.${AT},id.gt.${id(500)}))`);
      return { body: messages.slice(500) };
    });
    const res = await thread();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ conversation, messages });
    expect(pg.to(MESSAGES)).toHaveLength(2);
  });
});
