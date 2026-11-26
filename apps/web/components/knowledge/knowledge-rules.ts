import {
  ALLOWED_FILE_TYPES,
  fileTypeFromName,
  KNOWLEDGE_TITLE_MAX_LENGTH,
  type KnowledgeFileMimeType,
  type KnowledgeFileType,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
  MAX_EXTRACTED_TEXT_CHARS,
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
  type Plan,
} from "@kivo/shared";

// What the Knowledge tab shows and checks in the browser. The numbers come
// from packages/shared. Browser checks only save a round trip: the server
// checks again (upload-url, finalize, 403 plan_limit).

export const BILLING_HREF = "/dashboard/billing";

/** The `accept` attribute for the file picker. */
export const FILE_ACCEPT = ".pdf,.md,.txt,application/pdf,text/markdown,text/plain";

/** A file the browser may upload: its type, the MIME type Storage expects, and a title. */
export interface CheckedFile {
  type: KnowledgeFileType;
  contentType: KnowledgeFileMimeType;
  title: string;
}

/**
 * Checks a picked file's name and size before asking the server.
 * Returns the upload details, or the message to show.
 */
export function checkFile(file: { name: string; size: number }): CheckedFile | { error: string } {
  const type = fileTypeFromName(file.name);
  if (!type) return { error: "Choose a PDF, Markdown (.md) or text (.txt) file." };
  if (file.size === 0) return { error: "This file is empty." };
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) return { error: "Files can be up to 10 MB." };
  return {
    type,
    // From the extension, not `file.type`: browsers often leave .md blank.
    contentType: ALLOWED_FILE_TYPES[type],
    title: file.name.trim().slice(0, KNOWLEDGE_TITLE_MAX_LENGTH),
  };
}

const STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  // A reserved upload is shown as processing (docs/project.md §6.4 "Actions").
  uploading: "Processing",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function statusLabel(status: KnowledgeSourceStatus): string {
  return STATUS_LABELS[status];
}

/** After an upload whose text was cut to the cap. */
export const TRUNCATED_MESSAGE = `Only the first ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString("en-US")} characters of this file were used.`;

export const FAILED_MESSAGE = "Couldn't read this file. Delete it and try again.";

const TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  text: "Pasted text",
  pdf: "PDF",
  md: "Markdown",
  txt: "Text file",
};

export function typeLabel(type: KnowledgeSourceType): string {
  return TYPE_LABELS[type];
}

/** "2 of 3 sources" */
export function sourceCountLabel(plan: Plan, count: number): string {
  const max = PLAN_LIMITS[plan].knowledgeSources;
  return `${count} of ${max} sources`;
}

export function isAtSourceLimit(plan: Plan, count: number): boolean {
  return count >= PLAN_LIMITS[plan].knowledgeSources;
}

/** The message at the limit. */
export function sourceLimitMessage(plan: Plan): string {
  if (plan === "pro") {
    return `Pro includes ${PLAN_LIMITS.pro.knowledgeSources} sources per project. Delete one to add another.`;
  }
  return `Free includes ${PLAN_LIMITS.free.knowledgeSources} sources per project. Pro includes ${PLAN_LIMITS.pro.knowledgeSources}.`;
}
