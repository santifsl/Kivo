import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const {
  EMBED_MAX_BATCH_INPUTS,
  EMBED_MAX_BATCH_TOKENS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingError,
  embed,
  maxTokens,
  planBatches,
} = await import("./embed");

// Built at runtime so this file doesn't contain the variable's name
// (see openai-key.test.ts).
const KEY_ENV = ["OPENAI", "API", "KEY"].join("_");
const KEY = "sk-test-not-a-real-key";

const fetchMock = vi.fn<typeof fetch>();

interface EmbeddingsBody {
  model: string;
  input: string[];
  dimensions: number;
  encoding_format: string;
}

/** A vector that encodes which input it belongs to. */
const vectorFor = (text: string, length = EMBEDDING_DIMENSIONS) =>
  Array.from({ length }, (_, i) => (i === 0 ? text.length : 0.001 * i));

function respondWith(make: (body: EmbeddingsBody) => unknown) {
  fetchMock.mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as EmbeddingsBody;
    return Response.json(make(body));
  });
}

const okResponse = (body: EmbeddingsBody) => ({
  object: "list",
  model: body.model,
  // Out of order on purpose: the client must sort by `index`.
  data: body.input
    .map((text, index) => ({ object: "embedding", index, embedding: vectorFor(text) }))
    .reverse(),
  usage: { prompt_tokens: 1, total_tokens: 1 },
});

function requests(): { url: string; headers: Headers; body: EmbeddingsBody }[] {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: input instanceof Request ? input.url : String(input),
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body)) as EmbeddingsBody,
  }));
}

beforeEach(() => {
  vi.stubEnv(KEY_ENV, KEY);
  fetchMock.mockReset();
  respondWith(okResponse);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("planBatches", () => {
  it("bounds tokens by UTF-8 bytes, so any language is covered", () => {
    expect(maxTokens("abc")).toBe(3);
    expect(maxTokens("é")).toBe(2);
    expect(maxTokens("龘")).toBe(3);
    expect(maxTokens("🙂")).toBe(4);
  });

  it("caps each batch at the token budget", () => {
    const text = "x".repeat(100_000);
    expect(planBatches([text, text, text, text, text])).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ]);
  });

  it("caps each batch at the API's input count", () => {
    const batches = planBatches(Array.from({ length: EMBED_MAX_BATCH_INPUTS * 2 + 1 }, () => "a"));
    expect(batches).toEqual([
      { start: 0, end: EMBED_MAX_BATCH_INPUTS },
      { start: EMBED_MAX_BATCH_INPUTS, end: EMBED_MAX_BATCH_INPUTS * 2 },
      { start: EMBED_MAX_BATCH_INPUTS * 2, end: EMBED_MAX_BATCH_INPUTS * 2 + 1 },
    ]);
  });

  it("gives an over-budget text a batch of its own", () => {
    const huge = "x".repeat(EMBED_MAX_BATCH_TOKENS + 1);
    expect(planBatches(["a", huge, "b"])).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it("makes no batches for no texts", () => {
    expect(planBatches([])).toEqual([]);
  });
});

describe("embed", () => {
  it("uses text-embedding-3-small with 1536 dimensions", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it("returns one vector per text, in input order", async () => {
    const vectors = await embed(["a", "bb", "ccc"]);
    expect(vectors).toHaveLength(3);
    expect(vectors.map((v) => v.length)).toEqual([1536, 1536, 1536]);
    expect(vectors.map((v) => v[0])).toEqual([1, 2, 3]);

    const [req] = requests();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(req?.url).toBe("https://api.openai.com/v1/embeddings");
    expect(req?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(req?.body).toEqual({
      model: "text-embedding-3-small",
      input: ["a", "bb", "ccc"],
      dimensions: 1536,
      encoding_format: "float",
    });
  });

  it("batches by token budget and keeps input order", async () => {
    // 3,600-char chunks of 3-byte CJK: 10,800 bytes (an upper bound on tokens) each.
    const chunk = (n: number) => `${n}`.padEnd(3600, "龘");
    const texts = Array.from({ length: 60 }, (_, i) => chunk(i));
    const vectors = await embed(texts);

    const sizes = requests().map((r) => r.body.input.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(60);
    expect(sizes.length).toBeGreaterThan(1);
    for (const r of requests()) {
      const tokens = r.body.input.reduce((n, text) => n + maxTokens(text), 0);
      expect(tokens).toBeLessThanOrEqual(EMBED_MAX_BATCH_TOKENS);
    }
    expect(requests().flatMap((r) => r.body.input)).toEqual(texts);
    expect(vectors.map((v) => v[0])).toEqual(texts.map((t) => t.length));
  });
  it("makes no request for no texts", async () => {
    expect(await embed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty text before any request", async () => {
    await expect(embed(["ok", "  "])).rejects.toBeInstanceOf(EmbeddingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a vector of the wrong length", async () => {
    respondWith((body) => ({
      ...okResponse(body),
      data: body.input.map((text, index) => ({
        object: "embedding",
        index,
        embedding: vectorFor(text, 512),
      })),
    }));
    await expect(embed(["a"])).rejects.toThrow(
      new EmbeddingError("Embedding 0 has 512 dimensions, expected 1536."),
    );
  });

  it("rejects a response missing a vector", async () => {
    respondWith((body) => ({ ...okResponse(body), data: okResponse(body).data.slice(1) }));
    await expect(embed(["a", "b"])).rejects.toThrow(EmbeddingError);
  });

  it("surfaces an API error", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: { message: "bad input", type: "invalid_request_error" } },
        { status: 400 },
      ),
    );
    await expect(embed(["a"])).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws naming the missing key, without a request", async () => {
    vi.stubEnv(KEY_ENV, "");
    await expect(embed(["a"])).rejects.toThrow(`Missing environment variable ${KEY_ENV}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
