import { apiErrorSchema } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError, type Reply } from "../../../../lib/projects/fake-postgrest";

// DELETE /api/knowledge/:id. Real handler and supabase-js; Clerk and the
// network (PostgREST + Storage) are mocked.

vi.mock("server-only", () => ({}));

let userId: string | null = "user_a";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId, getToken: async () => (userId ? `token_${userId}` : null) }),
}));

const route = await import("./route");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const PUBLISHABLE = "sb_publishable_test_123";
const SECRET = "sb_secret_test_456";

const PROJECT = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const SOURCE = "1a2b3c4d-0000-4000-8000-000000000001";

let pg: ReturnType<typeof fakePostgrest>;

beforeEach(() => {
  userId = "user_a";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const del = (id = SOURCE) =>
  route.DELETE(new Request(`https://kivo.test/api/knowledge/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(apiErrorSchema.parse(await res.json()).error.code).toBe(code);
}

/** RLS shows the caller this source. */
function visible(
  type: "text" | "pdf",
  storageKey: string | null,
  rowDelete: Reply = { body: null },
) {
  pg.on("GET", "/rest/v1/knowledge_sources", {
    body: [
      {
        id: SOURCE,
        project_id: PROJECT,
        title: "Guide",
        type,
        storage_key: storageKey,
        status: "ready",
        created_at: "2026-11-21T00:00:00+00:00",
      },
    ],
  });
  pg.on("DELETE", "/rest/v1/knowledge_sources", rowDelete);
}

const serviceRequests = () => pg.requests.filter((r) => r.headers.get("apikey") === SECRET);

describe("DELETE /api/knowledge/:id", () => {
  it("signed out → 401, no database call", async () => {
    userId = null;
    await expectError(await del(), 401, "unauthorized");
    expect(pg.requests).toHaveLength(0);
  });

  it("another owner's source (RLS hides it) → 404, no service-client call", async () => {
    pg.on("GET", "/rest/v1/knowledge_sources", { body: [] });
    await expectError(await del(), 404, "not_found");

    const [read] = pg.requests;
    expect(pg.requests).toHaveLength(1);
    expect(read?.headers.get("authorization")).toBe("Bearer token_user_a");
    expect(read?.headers.get("apikey")).toBe(PUBLISHABLE);
    expect(read?.params.get("id")).toBe(`eq.${SOURCE}`);
    expect(serviceRequests()).toHaveLength(0);
  });

  it("a malformed id → 404, no database call", async () => {
    await expectError(await del("nope"), 404, "not_found");
    expect(pg.requests).toHaveLength(0);
  });

  it("a file source: removes the file, then the row (chunks cascade) → { ok: true }", async () => {
    const key = `${PROJECT}/${SOURCE}.pdf`;
    visible("pdf", key);
    pg.on("DELETE", "/storage/v1/object/knowledge", { body: [{ name: key }] });

    const res = await del();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });

    expect(serviceRequests().map((r) => `${r.method} ${r.path}`)).toEqual([
      "DELETE /storage/v1/object/knowledge",
      "DELETE /rest/v1/knowledge_sources",
    ]);
    expect(pg.to("/storage/v1/object/knowledge")[0]?.body).toEqual({ prefixes: [key] });
    const [row] = pg.to("/rest/v1/knowledge_sources", "DELETE");
    expect(row?.params.get("id")).toBe(`eq.${SOURCE}`);
    expect(row?.params.get("project_id")).toBe(`eq.${PROJECT}`);
  });

  it("a pasted text: deletes the row, no Storage call", async () => {
    visible("text", null);
    expect((await del()).status).toBe(200);
    expect(pg.requests.some((r) => r.path.startsWith("/storage/"))).toBe(false);
    expect(pg.to("/rest/v1/knowledge_sources", "DELETE")).toHaveLength(1);
  });

  it("a Storage failure → 500 and the row is kept, so the owner can retry", async () => {
    visible("pdf", `${PROJECT}/${SOURCE}.pdf`);
    pg.on("DELETE", "/storage/v1/object/knowledge", { status: 500, body: { message: "down" } });
    await expectError(await del(), 500, "internal");
    expect(pg.to("/rest/v1/knowledge_sources", "DELETE")).toHaveLength(0);
  });

  it("a database error → 500 without the error text", async () => {
    visible("text", null, pgError("XX000", "db.secret-host", 500));
    const res = await del();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret-host");
  });
});
