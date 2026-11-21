import type { KnowledgeFileType } from "@kivo/shared";
import { extractText as extractPdfText } from "unpdf";

// Text extraction for knowledge files, docs/project.md §6.4 "Processing".

export type ExtractErrorCode = "no_text" | "invalid_utf8" | "invalid_pdf";

const MESSAGES: Record<ExtractErrorCode, string> = {
  no_text: "The file has no text we can read.",
  invalid_utf8: "The file is not valid UTF-8 text.",
  invalid_pdf: "The file is not a readable PDF.",
};

/** A file we can't turn into text. `code` says why; `message` is safe to show the owner. */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, options?: { cause?: unknown }) {
    super(MESSAGES[code], options);
    this.name = "ExtractError";
    this.code = code;
  }
}

/**
 * Normalizes whitespace: LF line endings, no NUL or other control characters
 * (Postgres `text` rejects NUL), runs of spaces and tabs collapsed to one
 * space, lines trimmed, at most one blank line between paragraphs, trimmed
 * ends. Unicode is NFC-normalized so equal text compares equal.
 */
export function normalizeText(text: string): string {
  return (
    text
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      // Control characters other than \t and \n; form feed and vertical tab become breaks.
      .replace(/[\f\v]/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, "")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    // `fatal` rejects invalid UTF-8 instead of inserting U+FFFD; a leading BOM is dropped.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new ExtractError("invalid_utf8", { cause });
  }
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    // PDF.js may transfer (detach) the buffer it gets, so pass a copy.
    const { text } = await extractPdfText(new Uint8Array(bytes));
    return text.join("\n\n");
  } catch (cause) {
    throw new ExtractError("invalid_pdf", { cause });
  }
}

/**
 * The text of a knowledge file, whitespace-normalized. PDF via `unpdf`;
 * Markdown and TXT as strict UTF-8.
 *
 * @throws ExtractError `invalid_pdf`, `invalid_utf8`, or `no_text` when nothing is left.
 */
export async function extractText(bytes: Uint8Array, type: KnowledgeFileType): Promise<string> {
  const raw = type === "pdf" ? await pdfText(bytes) : decodeUtf8(bytes);
  const text = normalizeText(raw);
  if (!text) throw new ExtractError("no_text");
  return text;
}
