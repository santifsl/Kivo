// Text chunking for knowledge sources, docs/project.md §6.4 "Processing".
//
// Sizes are in characters, using ~4 characters per token for English text:
// 3,600 characters is ~900 tokens, inside the 800–1,000 token target.

/** Max characters in one chunk, overlap included (~900 tokens). */
export const CHUNK_MAX_CHARS = 3600;

/** Characters repeated from the end of a chunk at the start of the next one (~75 tokens). */
export const CHUNK_OVERLAP_CHARS = 300;

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

/** A unit of text that fits in a chunk, and the separator that goes before it. */
interface Piece {
  text: string;
  sep: string;
}

const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Packs `parts` (each at most `limit` long) into as few pieces of at most `limit` as possible. */
function pack(parts: readonly string[], sep: string, limit: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const part of parts) {
    if (!cur) cur = part;
    else if (cur.length + sep.length + part.length <= limit) cur += sep + part;
    else {
      out.push(cur);
      cur = part;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Splits text with no whitespace into slices of at most `limit`, never inside
 * a character. A grapheme longer than `limit` (an emoji ZWJ sequence, or a
 * letter with thousands of combining marks) is split between its code points,
 * so no slice exceeds the limit; `limit` is at least 2, so a code point fits.
 */
function hardSplit(word: string, limit: number): string[] {
  const parts: string[] = [];
  for (const { segment } of graphemes.segment(word)) {
    if (segment.length <= limit) parts.push(segment);
    else for (const codePoint of pack(Array.from(segment), "", limit)) parts.push(codePoint);
  }
  return pack(parts, "", limit);
}

// The split helpers append to `out` with a loop: a huge paragraph can make
// hundreds of thousands of pieces, too many to spread into `push(...)`.

/** Appends an over-long sentence split on whitespace, falling back to `hardSplit` for huge words. */
function splitSentence(sentence: string, sep: string, limit: number, out: Piece[]): void {
  let next = sep;
  for (const word of sentence.split(/\s+/)) {
    if (!word) continue;
    const slices = word.length <= limit ? [word] : hardSplit(word, limit);
    for (const [i, text] of slices.entries()) out.push({ text, sep: i === 0 ? next : "" });
    next = " ";
  }
}

/** Appends an over-long paragraph split on sentences, then on words. */
function splitParagraph(paragraph: string, sep: string, limit: number, out: Piece[]): void {
  let next = sep;
  for (const { segment } of sentences.segment(paragraph)) {
    const text = segment.trim();
    if (text) {
      if (text.length <= limit) out.push({ text, sep: next });
      else splitSentence(text, next, limit, out);
    }
    // Join the next sentence the way the text did: a line break, a space, or
    // nothing (CJK sentences have no space between them).
    const gap = segment.slice(segment.trimEnd().length);
    next = gap.includes("\n") ? "\n" : gap ? " " : "";
  }
}

/** Paragraphs, sentences, words, then characters: the largest units that fit in `limit`. */
function toPieces(text: string, limit: number): Piece[] {
  const pieces: Piece[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.length <= limit) pieces.push({ text: trimmed, sep: "\n\n" });
    else splitParagraph(trimmed, "\n\n", limit, pieces);
  }
  return pieces;
}

/** End of a sentence: Latin punctuation (and closing quotes) before a space, or CJK punctuation. */
const SENTENCE_END = /[.!?]["'”’)\]]*\s+|[。！？]/;

/**
 * The end of `chunk`, at most `max` characters, starting at a sentence when
 * one starts in it, else at a word. Empty when the chunk is that short (the
 * next chunk would repeat all of it) or the tail has no word break.
 */
function overlapTail(chunk: string, max: number): string {
  if (max <= 0 || chunk.length <= max) return "";
  const tail = chunk.slice(chunk.length - max);
  const end = SENTENCE_END.exec(tail);
  if (end) {
    const sentence = tail.slice(end.index + end[0].length).trimStart();
    if (sentence) return sentence;
  }
  const space = tail.search(/\s/);
  return space === -1 ? "" : tail.slice(space).trimStart();
}

/**
 * Splits text into chunks of at most `maxChars` characters (UTF-16 code
 * units, as `string.length` counts them; ~800–1,000 tokens by default). No
 * chunk is ever longer. Breaks between paragraphs where it can, then between
 * sentences, then between words; splits inside a word only when one word is
 * longer than a chunk, and inside a grapheme only when one grapheme is (never
 * inside a code point). Each chunk after the first starts with up to
 * `overlapChars` characters from the end of the one before, from a sentence
 * or word boundary. Pure and deterministic. Empty or whitespace-only text
 * gives `[]`.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? CHUNK_MAX_CHARS;
  const overlapChars = options.overlapChars ?? CHUNK_OVERLAP_CHARS;
  if (!Number.isInteger(maxChars) || maxChars < 2) {
    throw new RangeError("maxChars must be an integer of at least 2");
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars * 2 > maxChars) {
    throw new RangeError("overlapChars must be an integer from 0 to half of maxChars");
  }

  // Leave room for the overlap and its separator, so every chunk fits in maxChars.
  const limit = overlapChars > 0 ? maxChars - overlapChars - 2 : maxChars;
  if (limit < 2) throw new RangeError("maxChars is too small for overlapChars");
  const chunks: string[] = [];
  let cur = "";
  for (const { text: piece, sep } of toPieces(text, limit)) {
    if (!cur) cur = piece;
    else if (cur.length + sep.length + piece.length <= maxChars) cur += sep + piece;
    else {
      chunks.push(cur);
      const tail = overlapTail(cur, overlapChars);
      cur = tail ? tail + sep + piece : piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
