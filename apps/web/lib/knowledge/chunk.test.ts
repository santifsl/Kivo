import { describe, expect, it } from "vitest";
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, chunkText } from "./chunk";

/** `n` distinct sentences, so overlaps and order are checkable. */
function sentences(n: number, prefix = "Sentence"): string {
  return Array.from(
    { length: n },
    (_, i) => `${prefix} number ${i} is about refunds and shipping.`,
  ).join(" ");
}

/** Every word of `text`, in order, ignoring overlap repeats between chunks. */
function wordsCovered(chunks: string[], text: string): boolean {
  const joined = chunks.join(" ");
  return text.split(/\s+/).every((w) => joined.includes(w));
}

describe("chunkText", () => {
  it("defaults to ~800–1,000 tokens per chunk with a small overlap", () => {
    expect(CHUNK_MAX_CHARS / 4).toBeGreaterThanOrEqual(800);
    expect(CHUNK_MAX_CHARS / 4).toBeLessThanOrEqual(1000);
    expect(CHUNK_OVERLAP_CHARS).toBeLessThan(CHUNK_MAX_CHARS / 4);
  });

  it.each(["", "   ", "\n\n\t\n"])("returns no chunks for empty text %j", (text) => {
    expect(chunkText(text)).toEqual([]);
  });

  it("keeps one short paragraph as one chunk", () => {
    expect(chunkText("  We open at 9am.  ")).toEqual(["We open at 9am."]);
  });

  it("packs short paragraphs together, separated by a blank line", () => {
    expect(chunkText("One.\n\nTwo.\n\n\n\nThree.")).toEqual(["One.\n\nTwo.\n\nThree."]);
  });

  it("breaks between paragraphs when they don't fit together", () => {
    const a = sentences(40, "Alpha");
    const b = sentences(40, "Beta");
    const chunks = chunkText(`${a}\n\n${b}`);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(a);
    // The second chunk starts with the overlap from the end of the first, then the paragraph.
    const second = chunks[1] ?? "";
    expect(second.endsWith(b)).toBe(true);
    const overlap = second.slice(0, second.length - b.length - 2);
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.length).toBeLessThanOrEqual(CHUNK_OVERLAP_CHARS);
    expect(a.endsWith(overlap)).toBe(true);
  });

  it("splits a huge paragraph on sentences, every chunk within the limit", () => {
    const text = sentences(500);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk.length).toBeGreaterThan(CHUNK_MAX_CHARS / 2);
      // Each chunk ends on a sentence.
      expect(chunk.endsWith(".")).toBe(true);
    }
    expect(wordsCovered(chunks, text)).toBe(true);
  });

  it("repeats the end of each chunk at the start of the next, from a sentence", () => {
    const text = sentences(500);
    const chunks = chunkText(text);
    for (const [i, chunk] of chunks.entries()) {
      if (i === 0) continue;
      expect(chunks[i - 1]?.slice(-CHUNK_OVERLAP_CHARS)).toContain(chunk.slice(0, 40));
      expect(chunk).toMatch(/^Sentence number \d+ /);
      expect(text).toContain(chunk);
    }
  });

  it("splits a sentence with no punctuation on words", () => {
    const text = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk).toMatch(/^word\d+( word\d+)*$/);
    }
    expect(wordsCovered(chunks, text)).toBe(true);
  });

  it("splits one giant word without breaking characters", () => {
    const text = "🙂".repeat(5000); // 10,000 UTF-16 units, no spaces
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk).toMatch(/^(?:🙂)+$/u);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("keeps unicode text intact", () => {
    const text =
      "Café crème ☕ — naïve façade.\n\n東京は晴れです。明日も晴れ。\n\nМы открыты 24/7. 👩‍👩‍👧 family plan.";
    expect(chunkText(text)).toEqual([text]);

    const long = Array.from({ length: 400 }, (_, i) => `第${i}文は返金についてです。`).join("");
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
    }
    // No spaces added between CJK sentences: every chunk is a slice of the text.
    for (const chunk of chunks) expect(long).toContain(chunk);
    expect(chunks[1]).toMatch(/^第\d+文/); // the overlap starts at a sentence
  });

  it("keeps line breaks inside a paragraph", () => {
    expect(chunkText("Line one\nLine two")).toEqual(["Line one\nLine two"]);
  });

  it("is deterministic", () => {
    const text = `${sentences(300)}\n\n${sentences(10, "Tail")}`;
    expect(chunkText(text)).toEqual(chunkText(text));
  });

  it("honors custom sizes, and no overlap when it is 0", () => {
    const chunks = chunkText("aa bb cc dd ee ff", { maxChars: 5, overlapChars: 0 });
    expect(chunks).toEqual(["aa bb", "cc dd", "ee ff"]);
  });

  it.each([
    { maxChars: 1 },
    { maxChars: 100, overlapChars: 51 },
    { maxChars: 100, overlapChars: -1 },
    { maxChars: 4, overlapChars: 2 },
  ])("rejects invalid options %j", (options) => {
    expect(() => chunkText("text", options)).toThrow(RangeError);
  });
});
