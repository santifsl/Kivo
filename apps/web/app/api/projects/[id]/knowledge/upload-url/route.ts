import {
  createUploadUrlRequestSchema,
  type CreateUploadUrlResponse,
  fileTypeFromName,
  idParamsSchema,
} from "@kivo/shared";
import { getOwnerPlan } from "../../../../../../lib/accounts/get-owner-plan";
import {
  createSignedUpload,
  deleteSourceRow,
  KnowledgeLimitError,
  ProjectGoneError,
  removeStorageObjects,
  reserveFileSource,
} from "../../../../../../lib/knowledge/sources";
import {
  internalError,
  ownerError,
  ownerJson,
  readJson,
} from "../../../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../../../lib/projects/owner-session";
import { getOwnedProject } from "../../../../../../lib/projects/projects";
import { createServiceClient } from "../../../../../../lib/supabase/service";

// POST /api/projects/:id/knowledge/upload-url: step 1 of a file upload.
// docs/project.md §3 "File storage" + "Hosting", §6.4 "Upload", §9 "File upload".
//
// Files never pass through our routes (Vercel caps bodies at 4.5 MB). This
// reserves the source as `uploading` (it counts toward the limit) and returns
// a one-time signed upload URL for its storage key; the browser uploads
// straight to Storage, then calls finalize. Only the declared size and
// extension are checked here; finalize checks the real bytes.

type Context = { params: Promise<{ id: string }> };

const WHERE = "api/projects/:id/knowledge/upload-url POST";
const NOT_FOUND = "Project not found.";

export async function POST(request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(WHERE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);
  const projectId = params.data.id;

  try {
    // Ownership first, with the owner client (RLS): no service-client call before it.
    if (!(await getOwnedProject(session.client, projectId))) {
      return ownerError("not_found", NOT_FOUND);
    }

    const input = createUploadUrlRequestSchema.safeParse(await readJson(request));
    const type = input.success ? fileTypeFromName(input.data.fileName) : null;
    if (!input.success || !type) {
      return ownerError(
        "invalid_input",
        "Send a title and a .pdf, .md or .txt file of up to 10 MB.",
      );
    }

    // The plan comes from the database, never from the request (§9 "Plan bypass").
    const plan = await getOwnerPlan(async () => session.client);
    if (!plan) return internalError(WHERE, "couldn't read the owner's plan");

    const service = createServiceClient();
    const { source, reclaimedStorageKeys } = await reserveFileSource(
      service,
      projectId,
      input.data.title,
      plan,
      type,
    );

    try {
      await removeStorageObjects(service, reclaimedStorageKeys);
    } catch (err) {
      // The new reservation is fine; the stale files are only left behind.
      console.error(`[${WHERE}]`, err instanceof Error ? err.message : err);
    }

    if (!source.storage_key) throw new Error("reserved file source has no storage key");
    let upload: CreateUploadUrlResponse["upload"];
    try {
      upload = await createSignedUpload(service, source.storage_key);
    } catch (err) {
      // Don't let a reservation without an upload URL hold a slot.
      await deleteSourceRow(service, source).catch(() => {});
      throw err;
    }

    const body: CreateUploadUrlResponse = { source, upload };
    return ownerJson(body, 201);
  } catch (err) {
    if (err instanceof KnowledgeLimitError) {
      return ownerError(
        "plan_limit",
        "Your plan's knowledge source limit is reached. Delete a source or upgrade.",
      );
    }
    if (err instanceof ProjectGoneError) return ownerError("not_found", NOT_FOUND);
    return internalError(WHERE, err);
  }
}
