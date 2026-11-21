import { type DeleteKnowledgeSourceResponse, idParamsSchema } from "@kivo/shared";
import {
  deleteSourceRow,
  getVisibleSource,
  removeStorageObjects,
} from "../../../../lib/knowledge/sources";
import { internalError, ownerError, ownerJson } from "../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../lib/projects/owner-session";
import { createServiceClient } from "../../../../lib/supabase/service";

// DELETE /api/knowledge/:id: delete a source, its file and its chunks.
// docs/project.md §6.4 "Actions", §8 (Owner), §9 "Tenant leak".
//
// The source is read with the owner client first, so RLS only finds the
// caller's own: anything else is a 404 with no service-client call.

type Context = { params: Promise<{ id: string }> };

const WHERE = "api/knowledge/:id DELETE";
const NOT_FOUND = "Knowledge source not found.";

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(WHERE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);

  try {
    const source = await getVisibleSource(session.client, params.data.id);
    if (!source) return ownerError("not_found", NOT_FOUND);

    const service = createServiceClient();
    // File first: if Storage fails, the row stays and the owner can retry,
    // instead of an orphaned file with no row pointing at it.
    if (source.storage_key) await removeStorageObjects(service, [source.storage_key]);
    await deleteSourceRow(service, source);

    const body: DeleteKnowledgeSourceResponse = { ok: true };
    return ownerJson(body);
  } catch (err) {
    return internalError(WHERE, err);
  }
}
