import {
  type KnowledgeFileType,
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_KNOWLEDGE_FILE_BYTES,
} from "@kivo/shared";
import { ExtractError, extractText } from "./extract";

// Checks on an uploaded file's real bytes, at finalize. docs/project.md §6.4
// "Upload", §9 "File upload". The declared size and extension were checked at
// upload-url; these never trust them.

/** The file is refused. `message` is safe to show the owner and never quotes the file. */
export class UploadRefusedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UploadRefusedError";
  }
}

/** Every PDF starts with these bytes. */
const PDF_MAGIC = new TextEncoder().encode("%PDF-");

export function hasPdfMagic(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, i) => bytes[i] === byte);
}

export interface CappedText {
  text: string;
  /** Text past the cap was dropped. */
  truncated: boolean;
}

/** How far before the cap a word break may be to cut there instead of mid-word. */
export const WORD_BREAK_WINDOW = 1000;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * At most `max` characters (UTF-16 code units) of normalized text. Over the
 * cap, cuts at the last whitespace within `WORD_BREAK_WINDOW` characters
 * before `max` (a break before whitespace is always a grapheme boundary).
 * With no whitespace that close (say, CJK text after a heading), cuts at the
 * last grapheme boundary at or before `max`, so no emoji or accented letter
 * is split and the body is never dropped for an early line break.
 */
export function capText(text: string, max: number = MAX_EXTRACTED_TEXT_CHARS): CappedText {
  if (text.length <= max) return { text, truncated: false };

  const space = Math.max(text.lastIndexOf(" ", max), text.lastIndexOf("\n", max));
  if (space > 0 && space >= max - WORD_BREAK_WINDOW) {
    return { text: text.slice(0, space).trimEnd(), truncated: true };
  }

  // No whitespace near the cap: walk graphemes (lazily) up to the cap.
  let end = 0;
  for (const { index, segment } of graphemes.segment(text)) {
    if (index + segment.length > max) break;
    end = index + segment.length;
  }
  return { text: text.slice(0, end), truncated: true };
}

/**
 * The text of an uploaded file, after checking its real size, and for PDFs
 * its `%PDF-` magic bytes, capped at `MAX_EXTRACTED_TEXT_CHARS`.
 *
 * @throws UploadRefusedError when the file is too large, not what its type says, or has no text.
 */
export async function readUpload(bytes: Uint8Array, type: KnowledgeFileType): Promise<CappedText> {
  if (bytes.byteLength > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new UploadRefusedError("The file is larger than 10 MB.");
  }
  if (type === "pdf" && !hasPdfMagic(bytes)) {
    throw new UploadRefusedError("The file is not a PDF.");
  }
  let text: string;
  try {
    text = await extractText(bytes, type);
  } catch (err) {
    if (err instanceof ExtractError) throw new UploadRefusedError(err.message, { cause: err });
    throw err;
  }
  return capText(text);
}
