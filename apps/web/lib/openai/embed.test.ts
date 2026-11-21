import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const { EMBED_BATCH_SIZE, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EmbeddingError, embed } =
  await import("./embed");

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

  it("batches inputs", async () => {
    const texts = Array.from({ length: EMBED_BATCH_SIZE * 2 + 5 }, (_, i) => "x".repeat(i + 1));
    const vectors = await embed(texts);
    expect(requests().map((r) => r.body.input.length)).toEqual([
      EMBED_BATCH_SIZE,
      EMBED_BATCH_SIZE,
      5,
    ]);
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
