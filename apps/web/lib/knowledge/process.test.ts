import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "../projects/fake-postgrest";

// processSource against a fake PostgREST, with `embed` mocked (no OpenAI calls).

vi.mock("server-only", () => ({}));

const embedMock = vi.fn<(texts: readonly string[]) => Promise<number[][]>>();
vi.mock("../openai/embed", () => ({ embed: (texts: readonly string[]) => embedMock(texts) }));

const { processSource } = await import("./process");
const { CHUNK_MAX_CHARS } = await import("./chunk");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const SECRET = "sb_secret_test_456";

const SOURCE = "1a2b3c4d-0000-4000-8000-000000000001";
const PROJECT = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const SECRET_TEXT = "The vault code is 0451.";

/** Over 50 chunks (one insert batch) of text. */
const LONG_TEXT = Array.from({ length: 10_000 }, (_, i) => `Fact ${i} about returns.`).join(" ");

const vector = (seed: number) => Array.from({ length: 1536 }, (_, i) => (i === 0 ? seed : 0));

let pg: ReturnType<typeof fakePostgrest>;
let logged: string[];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv(SECRET_ENV, SECRET);
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
  pg.on("DELETE", "/rest/v1/knowledge_chunks", { status: 200, body: null });
  pg.on("POST", "/rest/v1/knowledge_chunks", { status: 201, body: null });
  pg.on("PATCH", "/rest/v1/knowledge_sources", { status: 200, body: null });
  embedMock.mockReset();
  embedMock.mockImplementation(async (texts) => texts.map((_, i) => vector(i)));
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const inserted = () =>
  pg.to("/rest/v1/knowledge_chunks", "POST").flatMap((r) => r.body as Record<string, unknown>[]);
const statuses = () =>
  pg.to("/rest/v1/knowledge_sources", "PATCH").map((r) => (r.body as { status: string }).status);

/** Every request is scoped to this source and project. */
function expectScoped() {
  for (const r of pg.to("/rest/v1/knowledge_chunks", "DELETE")) {
    expect(r.params.get("source_id")).toBe(`eq.${SOURCE}`);
    expect(r.params.get("project_id")).toBe(`eq.${PROJECT}`);
  }
  for (const r of pg.to("/rest/v1/knowledge_sources", "PATCH")) {
    expect(r.params.get("id")).toBe(`eq.${SOURCE}`);
    expect(r.params.get("project_id")).toBe(`eq.${PROJECT}`);
  }
  for (const r of pg.requests) expect(r.headers.get("apikey")).toBe(SECRET);
}

describe("processSource", () => {
  it("chunks, embeds, inserts the chunks and marks the source ready", async () => {
    const text = Array.from({ length: 300 }, (_, i) => `Fact ${i} about returns.`).join(" ");
    expect(await processSource(SOURCE, PROJECT, text)).toBe("ready");

    const [texts] = embedMock.mock.calls[0] ?? [];
    expect(texts?.length).toBeGreaterThan(1);
    for (const t of texts ?? []) expect(t.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);

    const rows = inserted();
    expect(rows.map((r) => r.content)).toEqual(texts);
    for (const [i, row] of rows.entries()) {
      expect(row.source_id).toBe(SOURCE);
      expect(row.project_id).toBe(PROJECT);
      // pgvector text form, 1536 numbers.
      const embedding = JSON.parse(String(row.embedding)) as number[];
      expect(embedding).toHaveLength(1536);
      expect(embedding[0]).toBe(i);
    }
    expect(statuses()).toEqual(["ready"]);
    expectScoped();
  });

  it("deletes existing chunks first, so it is idempotent", async () => {
    await processSource(SOURCE, PROJECT, "Short text.");
    const order = pg.requests.map((r) => `${r.method} ${r.path}`);
    expect(order).toEqual([
      "DELETE /rest/v1/knowledge_chunks",
      "POST /rest/v1/knowledge_chunks",
      "PATCH /rest/v1/knowledge_sources",
    ]);
  });

  it("inserts many chunks in batches", async () => {
    expect(await processSource(SOURCE, PROJECT, LONG_TEXT)).toBe("ready");
    const batches = pg.to("/rest/v1/knowledge_chunks", "POST");
    expect(batches.length).toBeGreaterThan(1);
    expect(inserted()).toHaveLength(embedMock.mock.calls[0]?.[0].length ?? -1);
  });

  it("on an embedding error: no chunks left, failed, logs only the source id", async () => {
    embedMock.mockRejectedValue(
      Object.assign(new Error(`429 ${SECRET_TEXT}`), { name: "RateLimitError", status: 429 }),
    );
    expect(await processSource(SOURCE, PROJECT, SECRET_TEXT)).toBe("failed");

    expect(inserted()).toEqual([]);
    expect(statuses()).toEqual(["failed"]);
    // Cleanup deleted chunks again after the failure.
    expect(pg.to("/rest/v1/knowledge_chunks", "DELETE")).toHaveLength(2);
    expect(logged.join("\n")).toContain(SOURCE);
    expect(logged.join("\n")).not.toContain("0451");
    expectScoped();
  });

  it("on an insert error after some batches: deletes the written chunks and marks failed", async () => {
    let n = 0;
    const handlerPg = fakePostgrest();
    vi.stubGlobal("fetch", handlerPg.fetchMock);
    handlerPg.on("DELETE", "/rest/v1/knowledge_chunks", { status: 200, body: null });
    handlerPg.on("POST", "/rest/v1/knowledge_chunks", () =>
      ++n === 1 ? { status: 201, body: null } : pgError("23503", `fk ${SECRET_TEXT}`, 409),
    );
    handlerPg.on("PATCH", "/rest/v1/knowledge_sources", { status: 200, body: null });

    expect(await processSource(SOURCE, PROJECT, LONG_TEXT)).toBe("failed");
    const order = handlerPg.requests.map((r) => r.method + " " + r.path.split("/").pop());
    expect(order.at(-2)).toBe("DELETE knowledge_chunks");
    expect(order.at(-1)).toBe("PATCH knowledge_sources");
    expect((handlerPg.requests.at(-1)?.body as { status: string }).status).toBe("failed");
    expect(logged.join("\n")).not.toContain("0451");
  });

  it("text with nothing to chunk → failed, no embedding call", async () => {
    expect(await processSource(SOURCE, PROJECT, " \u0000\n ")).toBe("failed");
    expect(embedMock).not.toHaveBeenCalled();
    expect(statuses()).toEqual(["failed"]);
  });

  it("still marks failed when the cleanup chunk delete fails", async () => {
    const failing = fakePostgrest();
    vi.stubGlobal("fetch", failing.fetchMock);
    failing.on("DELETE", "/rest/v1/knowledge_chunks", pgError("XX000", "down", 500));
    failing.on("PATCH", "/rest/v1/knowledge_sources", { status: 200, body: null });

    expect(await processSource(SOURCE, PROJECT, "Some text.")).toBe("failed");
    expect(failing.to("/rest/v1/knowledge_sources", "PATCH")).toHaveLength(1);
  });

  it("never throws, even without database settings", async () => {
    vi.stubEnv(SECRET_ENV, "");
    expect(await processSource(SOURCE, PROJECT, "Some text.")).toBe("failed");
    expect(pg.requests).toHaveLength(0);
  });
});
