import { type KnowledgeFileType, MAX_KNOWLEDGE_FILE_BYTES } from "@kivo/shared";
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

/**
 * The text of an uploaded file, after checking its real size, and for PDFs
 * its `%PDF-` magic bytes.
 *
 * @throws UploadRefusedError when the file is too large, not what its type says, or has no text.
 */
export async function readUpload(bytes: Uint8Array, type: KnowledgeFileType): Promise<string> {
  if (bytes.byteLength > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new UploadRefusedError("The file is larger than 10 MB.");
  }
  if (type === "pdf" && !hasPdfMagic(bytes)) {
    throw new UploadRefusedError("The file is not a PDF.");
  }
  try {
    return await extractText(bytes, type);
  } catch (err) {
    if (err instanceof ExtractError) throw new UploadRefusedError(err.message, { cause: err });
    throw err;
  }
}
