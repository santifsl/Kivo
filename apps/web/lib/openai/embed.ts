import "server-only";
import { createOpenAIClient } from "./client";

// Embeddings, docs/project.md §3 "AI" and §6.4 "Processing".

/** The embedding model. Chunk vectors and question vectors must use the same one. */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Length of every vector `EMBEDDING_MODEL` returns (the `chunks.embedding` column). */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Inputs per embeddings request. The API takes up to 2,048 inputs and
 * 300,000 tokens per request; 96 chunks of ~900 tokens stays well inside both.
 */
export const EMBED_BATCH_SIZE = 96;

/** The embeddings API answered with something we can't use. */
export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * One `EMBEDDING_DIMENSIONS`-length vector per text, in the same order.
 * Sends `EMBED_BATCH_SIZE` texts per request, one request at a time.
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
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
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
