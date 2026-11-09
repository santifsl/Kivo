import { z } from "zod";
import type { KnowledgeSourceStatus, KnowledgeSourceType } from "../enums";
import {
  MAX_FILE_BYTES,
  MAX_TEXT_SOURCE_LENGTH,
  ALLOWED_FILE_TYPES,
  fileTypeFromName,
  knowledgeFileMimeTypeSchema,
} from "../limits";
import type { OkResponse } from "../errors";
import { idSchema, type Timestamp } from "./common";

// Owner routes: knowledge sources. docs/project.md §6.4, §8.

export const KNOWLEDGE_TITLE_MAX_LENGTH = 200;
export const FILE_NAME_MAX_LENGTH = 255;
const titleSchema = z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX_LENGTH);

/** A knowledge source (`knowledge_sources` row, §7). `storage_key` is null for pasted text. */
export interface KnowledgeSource {
  id: string;
  project_id: string;
  title: string;
  type: KnowledgeSourceType;
  storage_key: string | null;
  status: KnowledgeSourceStatus;
  created_at: Timestamp;
}

/** POST /api/projects/:id/knowledge — body: pasted text. */
export const createTextSourceRequestSchema = z.strictObject({
  title: titleSchema,
  content: z.string().trim().min(1).max(MAX_TEXT_SOURCE_LENGTH),
});
export type CreateTextSourceRequest = z.infer<typeof createTextSourceRequestSchema>;

/** POST /api/projects/:id/knowledge — response. */
export interface CreateTextSourceResponse {
  source: KnowledgeSource;
}

/**
 * POST /api/projects/:id/knowledge/upload-url — body. Declared size and
 * extension are checked here; the real size and bytes at `finalize`.
 */
export const createUploadUrlRequestSchema = z
  .strictObject({
    title: titleSchema,
    fileName: z.string().trim().min(1).max(FILE_NAME_MAX_LENGTH),
    fileSize: z.number().int().positive().max(MAX_FILE_BYTES),
    contentType: knowledgeFileMimeTypeSchema,
  })
  .superRefine((body, ctx) => {
    const type = fileTypeFromName(body.fileName);
    if (!type) {
      ctx.addIssue({
        code: "custom",
        path: ["fileName"],
        message: "Allowed files: .pdf, .md, .txt",
      });
    } else if (ALLOWED_FILE_TYPES[type] !== body.contentType) {
      ctx.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "Content type doesn't match the file extension",
      });
    }
  });
export type CreateUploadUrlRequest = z.infer<typeof createUploadUrlRequestSchema>;

/** POST /api/projects/:id/knowledge/upload-url — response: the reserved source and a one-time signed upload. */
export interface CreateUploadUrlResponse {
  source: KnowledgeSource;
  upload: {
    signedUrl: string;
    token: string;
    path: string;
  };
}

/** POST /api/projects/:id/knowledge/finalize — body. */
export const finalizeUploadRequestSchema = z.strictObject({ sourceId: idSchema });
export type FinalizeUploadRequest = z.infer<typeof finalizeUploadRequestSchema>;

/** POST /api/projects/:id/knowledge/finalize — response. */
export interface FinalizeUploadResponse {
  source: KnowledgeSource;
}

/** DELETE /api/knowledge/:id — params: `idParamsSchema`; response. Deletes the file and chunks too. */
export type DeleteKnowledgeSourceResponse = OkResponse;
