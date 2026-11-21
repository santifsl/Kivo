import "server-only";
import { createOpenAIClient } from "./client";

// Embeddings, docs/project.md §3 "AI" and §6.4 "Processing".

/** The embedding model. Chunk vectors and question vectors must use the same one. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Length of every vector `EMBEDDING_MODEL` returns (the `chunks.embedding` column). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Max inputs in one embeddings request (the API's limit). */
export const EMBED_MAX_BATCH_INPUTS = 2048;

/**
 * Max total tokens in one embeddings request, below the API's 300,000.
 *
 * Batches are sized by UTF-8 bytes, not by an average characters-per-token
 * guess: the tokenizer is byte-level BPE and every token is at least one
 * byte, so a text's UTF-8 length is an upper bound on its tokens in any
 * language (rare CJK characters can cost up to 3 tokens each, which a
 * per-character estimate misses).
 */
export const EMBED_MAX_BATCH_TOKENS = 250_000;

const utf8 = new TextEncoder();

/** Upper bound on the tokens `text` costs: its UTF-8 length. */
export function maxTokens(text: string): number {
  return utf8.encode(text).length;
}

/**
 * Splits texts, in order, into batches of at most `EMBED_MAX_BATCH_INPUTS`
 * texts whose `maxTokens` sum stays within `EMBED_MAX_BATCH_TOKENS`. A text
 * over the budget on its own gets a batch to itself (the API's per-input
 * limit then decides). Returns start/end indexes into `texts`.
 */
export function planBatches(texts: readonly string[]): { start: number; end: number }[] {
  const batches: { start: number; end: number }[] = [];
  let start = 0;
  let tokens = 0;
  for (const [i, text] of texts.entries()) {
    const cost = maxTokens(text);
    const full = i - start >= EMBED_MAX_BATCH_INPUTS || tokens + cost > EMBED_MAX_BATCH_TOKENS;
    if (i > start && full) {
      batches.push({ start, end: i });
      start = i;
      tokens = 0;
    }
    tokens += cost;
  }
  if (texts.length > start) batches.push({ start, end: texts.length });
  return batches;
}

/** The embeddings API answered with something we can't use. */
export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * One `EMBEDDING_DIMENSIONS`-length vector per text, in the same order.
 * Sends the batches `planBatches` makes, one request at a time.
 * Empty input gives `[]` without a request.
 *
 * @throws EmbeddingError if a text is empty or a response is missing a vector or has the wrong length.
 * @throws OpenAI.APIError (from `openai`) when a request fails.
 */
export async function embed(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.some((text) => text.trim() === "")) {
    throw new EmbeddingError("Cannot embed an empty text.");
  }

  const client = createOpenAIClient();
  const vectors: number[][] = [];
  for (const { start, end } of planBatches(texts)) {
    const batch = texts.slice(start, end);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });

    const byIndex = new Map(response.data.map((item) => [item.index, item.embedding]));
    for (let i = 0; i < batch.length; i++) {
      const vector = byIndex.get(i);
      if (!vector) throw new EmbeddingError(`No embedding returned for input ${start + i}.`);
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new EmbeddingError(
          `Embedding ${start + i} has ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}.`,
        );
      }
      vectors.push(vector);
    }
  }
  return vectors;
}
