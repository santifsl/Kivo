import { readFile } from "node:fs/promises";
import { apiErrorSchema, MAX_KNOWLEDGE_FILE_BYTES } from "@kivo/shared";
import type * as NextServer from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, type RecordedRequest } from "../../../../../../lib/projects/fake-postgrest";

// POST /api/projects/:id/knowledge/finalize. Real handler, supabase-js and
// extraction; Clerk, the network (PostgREST + Storage), `after()` and
// `embed` are mocked. A small in-memory bucket serves downloads.

vi.mock("server-only", () => ({}));

const captureImmediate = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/posthog/server", () => ({
  getPosthogServer: () => ({ captureImmediate }),
}));

let userId: string | null = "user_a";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId, getToken: async () => (userId ? `token_${userId}` : null) }),
}));

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
vi.mock("../../../../../../lib/openai/embed", () => ({
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

const fixture = async (name: string) =>
  new Uint8Array(
    await readFile(new URL(`../../../../../../test/fixtures/knowledge/${name}`, import.meta.url)),
  );

let pg: ReturnType<typeof fakePostgrest>;
/** The bucket: storage key → bytes. */
let bucket: Map<string, Uint8Array>;
let downloads: string[];
let downloadStatus: number | null;
let storageDeleteFails: boolean;
/** The source row's status in the fake database. */
let status: "uploading" | "processing" | "ready" | "failed" | "deleted";
let type: "pdf" | "md" | "txt";
const key = () => `${PROJECT}/${SOURCE}.${type}`;

const DOWNLOAD = /^\/storage\/v1\/object\/knowledge\/(.+)$/;

beforeEach(() => {
  captureImmediate.mockReset();
  userId = "user_a";
  pending.length = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
  pg = fakePostgrest();
  bucket = new Map();
  downloads = [];
  downloadStatus = null;
  storageDeleteFails = false;
  status = "uploading";
  type = "pdf";

  // Downloads return raw bytes; everything else goes to the fake PostgREST.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const match = DOWNLOAD.exec(url.pathname);
    if (match && (init?.method ?? "GET") === "GET") {
      const path = decodeURIComponent(match[1] ?? "");
      downloads.push(path);
      if (downloadStatus) return Response.json({ message: "down" }, { status: downloadStatus });
      const bytes = bucket.get(path);
      return bytes
        ? new Response(new Blob([new Uint8Array(bytes)]))
        : Response.json(
            { statusCode: "404", error: "not_found", message: "Object not found" },
            { status: 400 },
          );
    }
    return pg.fetchMock(input, init);
  });

  owns();
  database();
  embedMock.mockReset();
  embedMock.mockImplementation(async (texts) => texts.map(() => Array<number>(1536).fill(0.5)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function owns() {
  pg.on("GET", "/rest/v1/projects", (req) =>
    req.headers.get("authorization") === "Bearer token_user_a"
      ? {
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
        }
      : { body: [] },
  );
}

const row = () => ({
  id: SOURCE,
  project_id: PROJECT,
  title: "Guide",
  type,
  storage_key: key(),
  status,
  created_at: CREATED,
});

/** A stateful knowledge_sources row: the claim only matches while it is `uploading`. */
function database() {
  pg.on("PATCH", "/rest/v1/knowledge_sources", (req: RecordedRequest) => {
    const next = (req.body as { status: typeof status }).status;
    const want = req.params.get("status");
    const matches =
      status !== "deleted" &&
      req.params.get("id") === `eq.${SOURCE}` &&
      req.params.get("project_id") === `eq.${PROJECT}` &&
      (!want || want === `eq.${status}`);
    if (!matches) return { body: [] };
    status = next;
    return { body: [row()] };
  });
  pg.on("DELETE", "/rest/v1/knowledge_sources", () => {
    status = "deleted";
    return { body: null };
  });
  pg.on("DELETE", "/storage/v1/object/knowledge", (req) => {
    if (storageDeleteFails) return { status: 500, body: { message: "down" } };
    for (const k of (req.body as { prefixes: string[] }).prefixes) bucket.delete(k);
    return { body: [] };
  });
  pg.on("DELETE", "/rest/v1/knowledge_chunks", { body: null });
  pg.on("POST", "/rest/v1/knowledge_chunks", { status: 201, body: null });
}

const finalize = (body: unknown = { sourceId: SOURCE }, id = PROJECT) =>
  route.POST(
    new Request(`https://kivo.test/api/projects/${id}/knowledge/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

async function expectError(res: Response, code: number, errorCode: string): Promise<string> {
  expect(res.status).toBe(code);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const { error } = apiErrorSchema.parse(await res.json());
  expect(error.code).toBe(errorCode);
  return error.message;
}

const serviceRequests = () => pg.requests.filter((r) => r.headers.get("apikey") === SECRET);

/** The file and row are gone, and nothing was processed. */
function expectRemoved() {
  expect(bucket.has(key())).toBe(false);
  expect(status).toBe("deleted");
  expect(pending).toHaveLength(0);
  expect(embedMock).not.toHaveBeenCalled();
}

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("signed out → 401, no database call", async () => {
    userId = null;
    await expectError(await finalize(), 401, "unauthorized");
    expect(pg.requests).toHaveLength(0);
  });

  it("another owner's project → 404, no service-client or Storage call", async () => {
    userId = "user_b";
    bucket.set(key(), await fixture("sample.pdf"));
    await expectError(await finalize(), 404, "not_found");
    expect(serviceRequests()).toHaveLength(0);
    expect(downloads).toEqual([]);
    expect(status).toBe("uploading");
  });

  it.each([
    ["no sourceId", {}],
    ["a malformed sourceId", { sourceId: "nope" }],
    ["not JSON", "{oops"],
  ])("%s → 400, nothing claimed", async (_, body) => {
    await expectError(await finalize(body), 400, "invalid_input");
    expect(serviceRequests()).toHaveLength(0);
  });

  it("a good PDF → 200 processing, claimed once, then chunks + ready after the response", async () => {
    bucket.set(key(), await fixture("sample.pdf"));

    const res = await finalize();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ source: { ...row(), status: "processing" } });

    // The claim: one UPDATE uploading → processing, scoped to this project, service key.
    const [claim] = pg.to("/rest/v1/knowledge_sources", "PATCH");
    expect(claim?.body).toEqual({ status: "processing" });
    expect(claim?.params.get("status")).toBe("eq.uploading");
    expect(claim?.params.get("project_id")).toBe(`eq.${PROJECT}`);
    expect(claim?.headers.get("apikey")).toBe(SECRET);
    expect(downloads).toEqual([key()]);
    expect(embedMock).not.toHaveBeenCalled();
    expect(captureImmediate).not.toHaveBeenCalled();

    await runAfter();
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedMock.mock.calls[0]?.[0].join(" ")).toContain("Refunds are processed");
    expect(pg.to("/rest/v1/knowledge_chunks", "POST")).toHaveLength(1);
    expect(status).toBe("ready");
    expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_a",
      event: "knowledge_added",
      properties: { project_id: PROJECT },
    });
    // The file stays: it is the source.
    expect(bucket.has(key())).toBe(true);
  });

  it.each([
    ["md", "sample.md", "# Shipping"],
    ["txt", "sample.txt", "Plain text FAQ."],
  ] as const)("a good .%s → processing → ready", async (t, file, text) => {
    type = t;
    bucket.set(key(), await fixture(file));
    expect((await finalize()).status).toBe(200);
    await runAfter();
    expect(embedMock.mock.calls[0]?.[0].join(" ")).toContain(text);
    expect(status).toBe("ready");
  });

  it("finalize twice → the second is refused (404) and nothing is processed twice", async () => {
    bucket.set(key(), await fixture("sample.pdf"));
    const [first, second] = await Promise.all([finalize(), finalize()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 404]);
    expect(downloads).toHaveLength(1);
    await runAfter();
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(captureImmediate).toHaveBeenCalledOnce();

    // And again, after processing finished.
    const third = await finalize();
    expect(await expectError(third, 404, "not_found")).toBe(
      "No upload is waiting to be finalized.",
    );
    expect(downloads).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });

  it("a fake PDF (a renamed .exe, wrong magic bytes) → 400, file and row deleted", async () => {
    bucket.set(key(), new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]));
    const message = await expectError(await finalize(), 400, "invalid_input");
    expect(message).toBe("The file is not a PDF. The file was removed.");
    expectRemoved();
    expect(pg.to("/storage/v1/object/knowledge", "DELETE")[0]?.body).toEqual({ prefixes: [key()] });
  });

  it("real size over the limit (declared smaller) → 400, file and row deleted", async () => {
    type = "txt";
    bucket.set(key(), new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1).fill(0x61));
    const message = await expectError(await finalize(), 400, "invalid_input");
    expect(message).toBe("The file is larger than 10 MB. The file was removed.");
    expectRemoved();
  });

  it("a .txt that isn't UTF-8 → 400, file and row deleted", async () => {
    type = "txt";
    bucket.set(key(), new Uint8Array([0x4d, 0x5a, 0xff, 0xfe, 0x00]));
    await expectError(await finalize(), 400, "invalid_input");
    expectRemoved();
  });

  it("a PDF with no text → 400, file and row deleted", async () => {
    bucket.set(key(), await fixture("no-text.pdf"));
    expect(await expectError(await finalize(), 400, "invalid_input")).toBe(
      "The file has no text we can read. The file was removed.",
    );
    expectRemoved();
  });

  it("a refused file whose Storage delete fails still deletes the row → 400", async () => {
    bucket.set(key(), new Uint8Array([0x4d, 0x5a]));
    storageDeleteFails = true;
    await expectError(await finalize(), 400, "invalid_input");
    expect(status).toBe("deleted");
  });

  it("not uploaded yet → 400, claim released to uploading, row kept", async () => {
    const message = await expectError(await finalize(), 400, "invalid_input");
    expect(message).toBe("Upload the file first, then finalize.");
    expect(status).toBe("uploading");
    expect(pending).toHaveLength(0);

    // Upload, then finalize works.
    bucket.set(key(), await fixture("sample.pdf"));
    expect((await finalize()).status).toBe(200);
  });

  it("a Storage outage on download → 500, claim released for a retry", async () => {
    bucket.set(key(), await fixture("sample.pdf"));
    downloadStatus = 503;
    await expectError(await finalize(), 500, "internal");
    expect(status).toBe("uploading");
    expect(bucket.has(key())).toBe(true);
  });

  it("never logs file content", async () => {
    type = "txt";
    const secret = new TextEncoder().encode("The vault code is 0451.\u0000");
    bucket.set(key(), new Uint8Array([...secret, 0xff]));
    await finalize();
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join("\n");
    expect(logged).not.toContain("0451");
  });
});
