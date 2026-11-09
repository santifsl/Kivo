import { z } from "zod";

// Input limits, docs/project.md §9 (Cost abuse, File upload).

/** Max characters in one visitor chat message. */
export const MAX_MESSAGE_LENGTH = 1000;

/** Max characters in one pasted text knowledge source. */
export const MAX_TEXT_SOURCE_LENGTH = 50_000;

/** Max size of one uploaded knowledge file, in bytes (10 MB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Same limit under the name docs/project.md §6.4 uses. */
export const MAX_KNOWLEDGE_FILE_BYTES = MAX_FILE_BYTES;

/** Allowed upload file types: extension → MIME type. */
export const ALLOWED_FILE_TYPES = {
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
} as const;

export type KnowledgeFileType = keyof typeof ALLOWED_FILE_TYPES;
export type KnowledgeFileMimeType = (typeof ALLOWED_FILE_TYPES)[KnowledgeFileType];

export const KNOWLEDGE_FILE_TYPES = [
  "pdf",
  "md",
  "txt",
] as const satisfies readonly KnowledgeFileType[];
export const knowledgeFileTypeSchema = z.enum(KNOWLEDGE_FILE_TYPES);

export const KNOWLEDGE_FILE_MIME_TYPES = Object.values(ALLOWED_FILE_TYPES) as [
  KnowledgeFileMimeType,
  ...KnowledgeFileMimeType[],
];
export const knowledgeFileMimeTypeSchema = z.enum(KNOWLEDGE_FILE_MIME_TYPES);

/** The allowed file type for a file name, from its extension, or null. */
export function fileTypeFromName(fileName: string): KnowledgeFileType | null {
  const ext = fileName.toLowerCase().split(".").pop();
  const parsed = knowledgeFileTypeSchema.safeParse(ext);
  return parsed.success && fileName.includes(".") ? parsed.data : null;
}
