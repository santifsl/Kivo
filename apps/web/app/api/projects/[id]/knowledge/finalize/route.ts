import { after } from "next/server";
import {
  type FinalizeUploadResponse,
  finalizeUploadRequestSchema,
  idParamsSchema,
} from "@kivo/shared";
import { processSource } from "../../../../../../lib/knowledge/process";
import {
  claimUpload,
  deleteSourceRow,
  downloadObject,
  MissingUploadError,
  releaseUpload,
  removeStorageObjects,
} from "../../../../../../lib/knowledge/sources";
import { readUpload, UploadRefusedError } from "../../../../../../lib/knowledge/upload";
import { captureOwnerEvent } from "../../../../../../lib/posthog/owner-events";
import {
  internalError,
  ownerError,
  ownerJson,
  readJson,
} from "../../../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../../../lib/projects/owner-session";
import { getOwnedProject } from "../../../../../../lib/projects/projects";
import { createServiceClient } from "../../../../../../lib/supabase/service";

// POST /api/projects/:id/knowledge/finalize: step 3 of a file upload, after
// the browser uploaded to the signed URL. docs/project.md §6.4 "Upload",
// §9 "File upload".
//
// 1. Claims the source once (`uploading` → `processing`, one UPDATE). No
//    waiting upload → 404 `not_found`: an unknown id, another project's
//    source, one already finalized (a second call), or one reclaimed after
//    2 hours all look the same, and nothing is processed twice.
// 2. Downloads the object and checks the real size and, for PDFs, the
//    `%PDF-` magic bytes, then extracts the text.
// 3. A refused file (too large, wrong bytes, no text): the file and the row
//    are deleted → 400 `invalid_input`. Not uploaded yet → the claim is
//    released (back to `uploading`) → 400, so the owner can upload and retry.
// 4. Otherwise chunks and embeddings run after the response → `processing`.
//
// File content is never logged.

type Context = { params: Promise<{ id: string }> };

const WHERE = "api/projects/:id/knowledge/finalize POST";

function logError(err: unknown) {
  console.error(`[${WHERE}]`, err instanceof Error ? err.message : err);
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(WHERE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", "Project not found.");
  const projectId = params.data.id;

  try {
    // Ownership first, with the owner client (RLS): no service-client call before it.
    if (!(await getOwnedProject(session.client, projectId))) {
      return ownerError("not_found", "Project not found.");
    }

    const input = finalizeUploadRequestSchema.safeParse(await readJson(request));
    if (!input.success) return ownerError("invalid_input", "Send the sourceId to finalize.");

    const service = createServiceClient();
    const source = await claimUpload(service, projectId, input.data.sourceId);
    if (!source) return ownerError("not_found", "No upload is waiting to be finalized.");
    const key = source.storage_key;
    if (source.type === "text" || !key) throw new Error("claimed source is not a file");

    let text: string;
    try {
      text = await readUpload(await downloadObject(service, key), source.type);
    } catch (err) {
      if (err instanceof UploadRefusedError) {
        // Delete the file, then the row. If Storage fails, the row still goes
        // (the slot is freed) and the file goes with the project folder.
        await removeStorageObjects(service, [key]).catch(logError);
        await deleteSourceRow(service, source);
        return ownerError("invalid_input", `${err.message} The file was removed.`);
      }
      await releaseUpload(service, source).catch(logError);
      if (err instanceof MissingUploadError) {
        return ownerError("invalid_input", "Upload the file first, then finalize.");
      }
      throw err;
    }

    after(async () => {
      if ((await processSource(source.id, projectId, text)) === "ready") {
        await captureOwnerEvent(session.userId, "knowledge_added", projectId);
      }
    });

    const body: FinalizeUploadResponse = { source };
    return ownerJson(body);
  } catch (err) {
    return internalError(WHERE, err);
  }
}
