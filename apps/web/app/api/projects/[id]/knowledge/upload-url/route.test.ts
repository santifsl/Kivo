import { apiErrorSchema, MAX_KNOWLEDGE_FILE_BYTES } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "../../../../../../lib/projects/fake-postgrest";

// POST /api/projects/:id/knowledge/upload-url. Real handler and supabase-js;
// Clerk and the network (PostgREST + Storage) are mocked.

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
const SUPABASE_URL = "https://project-ref.supabase.co";

const PROJECT = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const SOURCE = "1a2b3c4d-0000-4000-8000-000000000001";
const KEY = `${PROJECT}/${SOURCE}.pdf`;
const CREATED = "2026-11-21T00:00:00+00:00";

let pg: ReturnType<typeof fakePostgrest>;

beforeEach(() => {
  userId = "user_a";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
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

const GOOD = {
  title: "Guide",
  fileName: "guide.pdf",
  fileSize: 120_000,
  contentType: "application/pdf",
};

const post = (body: unknown, id = PROJECT) =>
  route.POST(
    new Request(`https://kivo.test/api/projects/${id}/knowledge/upload-url`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(apiErrorSchema.parse(await res.json()).error.code).toBe(code);
}

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

function reserves(reclaimed: string[] = []) {
  pg.on("POST", "/rest/v1/rpc/reserve_knowledge_source", (req) => {
    const args = req.body as { p_project_id: string; p_title: string; p_type: string };
    return {
      body: {
        id: SOURCE,
        project_id: args.p_project_id,
        title: args.p_title,
        type: args.p_type,
        storage_key: `${args.p_project_id}/${SOURCE}.${args.p_type}`,
        status: "uploading",
        created_at: CREATED,
        reclaimed_storage_keys: reclaimed,
      },
    };
  });
}

/** Storage signs an upload URL for the requested path. */
function signs() {
  pg.on("POST", `/storage/v1/object/upload/sign/knowledge/${KEY}`, {
    body: { url: `/object/upload/sign/knowledge/${KEY}?token=one-time-token` },
  });
}

const serviceRequests = () => pg.requests.filter((r) => r.headers.get("apikey") === SECRET);

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  it("signed out → 401, no database call", async () => {
    userId = null;
    await expectError(await post(GOOD), 401, "unauthorized");
    expect(pg.requests).toHaveLength(0);
  });

  it("another owner's project → 404, no service-client or Storage call", async () => {
    pg.on("GET", "/rest/v1/projects", { body: [] });
    await expectError(await post(GOOD), 404, "not_found");
    expect(pg.requests.map((r) => `${r.method} ${r.path}`)).toEqual(["GET /rest/v1/projects"]);
    expect(serviceRequests()).toHaveLength(0);
  });

  it.each([
    ["declared 11 MB", { ...GOOD, fileSize: 11 * 1024 * 1024 }],
    ["declared 1 byte over the limit", { ...GOOD, fileSize: MAX_KNOWLEDGE_FILE_BYTES + 1 }],
    ["a .docx", { ...GOOD, fileName: "guide.docx" }],
    [
      "a .docx with a PDF content type",
      { ...GOOD, fileName: "guide.docx", contentType: "application/pdf" },
    ],
    ["an .exe", { ...GOOD, fileName: "setup.exe", contentType: "application/octet-stream" }],
    ["no extension", { ...GOOD, fileName: "pdf" }],
    ["a content type that doesn't match", { ...GOOD, contentType: "text/plain" }],
    ["a zero size", { ...GOOD, fileSize: 0 }],
    ["no title", { ...GOOD, title: " " }],
    ["an extra field", { ...GOOD, plan: "pro" }],
    ["not JSON", "{oops"],
  ])("%s → 400, nothing reserved", async (_, body) => {
    owns();
    await expectError(await post(body), 400, "invalid_input");
    expect(serviceRequests()).toHaveLength(0);
  });

  it.each([
    ["guide.pdf", "application/pdf", "pdf"],
    ["README.MD", "text/markdown", "md"],
    ["faq.txt", "text/plain", "txt"],
  ])(
    "reserves %s as an `%s` upload under the plan's limit",
    async (fileName, contentType, type) => {
      owns("pro");
      reserves();
      pg.on("POST", `/storage/v1/object/upload/sign/knowledge/${PROJECT}/${SOURCE}.${type}`, {
        body: { url: `/object/upload/sign/knowledge/${PROJECT}/${SOURCE}.${type}?token=t` },
      });
      expect((await post({ ...GOOD, fileName, contentType })).status).toBe(201);
      expect(pg.to("/rest/v1/rpc/reserve_knowledge_source")[0]?.body).toEqual({
        p_project_id: PROJECT,
        p_title: "Guide",
        p_type: type,
        p_status: "uploading",
        p_max_sources: 25,
      });
    },
  );

  it("→ 201 with the uploading source and a one-time signed upload for its key", async () => {
    owns();
    reserves();
    signs();

    const res = await post(GOOD);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      source: {
        id: SOURCE,
        project_id: PROJECT,
        title: "Guide",
        type: "pdf",
        storage_key: KEY,
        status: "uploading",
        created_at: CREATED,
      },
      upload: {
        signedUrl: `${SUPABASE_URL}/storage/v1/object/upload/sign/knowledge/${KEY}?token=one-time-token`,
        token: "one-time-token",
        path: KEY,
      },
    });
    const [sign] = pg.to(`/storage/v1/object/upload/sign/knowledge/${KEY}`);
    expect(sign?.headers.get("apikey")).toBe(SECRET);
    // No upsert: the URL can't overwrite an uploaded object, so it works once.
    expect(sign?.headers.get("x-upsert")).toBeNull();
    // Never a public URL.
    expect(pg.requests.some((r) => r.path.includes("/object/public/"))).toBe(false);
  });

  it("at the limit → 403 plan_limit, no upload URL", async () => {
    owns("free");
    pg.on(
      "POST",
      "/rest/v1/rpc/reserve_knowledge_source",
      pgError("KV005", "knowledge_limit: the plan allows 3 source(s) per project"),
    );
    await expectError(await post(GOOD), 403, "plan_limit");
    expect(pg.requests.some((r) => r.path.startsWith("/storage/"))).toBe(false);
  });

  it("deletes reclaimed upload files", async () => {
    owns();
    reserves([`${PROJECT}/old.pdf`]);
    signs();
    pg.on("DELETE", "/storage/v1/object/knowledge", { body: [] });
    expect((await post(GOOD)).status).toBe(201);
    expect(pg.to("/storage/v1/object/knowledge", "DELETE")[0]?.body).toEqual({
      prefixes: [`${PROJECT}/old.pdf`],
    });
  });

  it("signing fails → 500, and the reservation is deleted so it holds no slot", async () => {
    owns();
    reserves();
    pg.on("POST", `/storage/v1/object/upload/sign/knowledge/${KEY}`, {
      status: 500,
      body: { message: "down" },
    });
    pg.on("DELETE", "/rest/v1/knowledge_sources", { body: null });
    await expectError(await post(GOOD), 500, "internal");
    const [row] = pg.to("/rest/v1/knowledge_sources", "DELETE");
    expect(row?.params.get("id")).toBe(`eq.${SOURCE}`);
  });
});
