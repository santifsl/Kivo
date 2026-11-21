import { describe, expect, it, vi } from "vitest";

// Seeds a dev project with a few chunks about a fictional product, so the chat
// route can be checked on a preview before the Knowledge routes exist
// (P3K-T08). Skipped unless KIVO_SEED_CHUNKS is set, so CI never runs it.
//
//   KIVO_SEED_CHUNKS=seed   KIVO_SEED_PROJECT_KEY=pk_… pnpm --filter @kivo/web exec vitest run lib/chat/seed-chunks.dev.test.ts
//   KIVO_SEED_CHUNKS=delete KIVO_SEED_PROJECT_KEY=pk_… pnpm --filter @kivo/web exec vitest run lib/chat/seed-chunks.dev.test.ts
//
// `seed` replaces any earlier seed (one embeddings call, ~6 short inputs);
// `delete` removes it (the source row; its chunks cascade). Real OpenAI and
// the Supabase dev project: never point it at production.

vi.mock("server-only", () => ({}));

const SEED_TITLE = "[seed] Lumio lamp facts (P3K-T08)";

/** Facts about a made-up product: nothing a model could know without the passages. */
export const SEED_FACTS = [
  "Lumio is a rechargeable smart desk lamp made by Brightfold Labs.",
  "Lumio's battery lasts 14 hours on a full charge, and a full charge takes 2 hours over USB-C.",
  "Every Lumio comes with a 2-year warranty that covers manufacturing defects but not water damage.",
  "Brightfold ships Lumio free within the US in 3 to 5 business days. Shipping to Canada costs $12 and takes 7 to 10 business days.",
  "You can return an unused Lumio in its original box within 45 days of delivery for a full refund.",
  "Lumio comes in three colors: Sage, Charcoal and Sand.",
];

const mode = process.env.KIVO_SEED_CHUNKS;
const publicKey = process.env.KIVO_SEED_PROJECT_KEY ?? "";

describe.skipIf(mode !== "seed" && mode !== "delete")("seed chunks on the dev project", () => {
  it(`${mode ?? "skip"}s the Lumio facts`, async () => {
    const { createServiceClient } = await import("../supabase/service");
    const db = createServiceClient();

    const { data: project, error } = await db
      .from("projects")
      .select("id")
      .eq("public_key", publicKey)
      .single();
    if (error) throw new Error(`No project for that key (${error.code}).`);

    const removed = await db
      .from("knowledge_sources")
      .delete()
      .eq("project_id", project.id)
      .eq("title", SEED_TITLE)
      .select("id");
    if (removed.error) throw new Error(`Delete failed (${removed.error.code}).`);
    console.info(`[seed] removed ${removed.data.length} earlier seed source(s)`);
    if (mode === "delete") return;

    const { embed } = await import("../openai/embed");
    const vectors = await embed(SEED_FACTS);

    const source = await db
      .from("knowledge_sources")
      .insert({ project_id: project.id, title: SEED_TITLE, type: "text", status: "ready" })
      .select("id")
      .single();
    if (source.error) throw new Error(`Source insert failed (${source.error.code}).`);

    const chunks = await db.from("knowledge_chunks").insert(
      SEED_FACTS.map((content, i) => ({
        project_id: project.id,
        source_id: source.data.id,
        content,
        embedding: JSON.stringify(vectors[i]),
      })),
    );
    if (chunks.error) throw new Error(`Chunk insert failed (${chunks.error.code}).`);
    console.info(`[seed] inserted ${SEED_FACTS.length} chunks into project ${project.id}`);
    expect(vectors).toHaveLength(SEED_FACTS.length);
  });
});
