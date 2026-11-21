import {
  type DeleteProjectResponse,
  idParamsSchema,
  updateProjectRequestSchema,
  type UpdateProjectResponse,
} from "@kivo/shared";
import { removeProjectFiles } from "../../../../lib/knowledge/sources";
import { internalError, ownerError, ownerJson, readJson } from "../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../lib/projects/owner-session";
import { deleteProject, renameProject } from "../../../../lib/projects/projects";
import { createServiceClient } from "../../../../lib/supabase/service";

// PATCH  /api/projects/:id: rename (name only).
// DELETE /api/projects/:id: delete with everything in it, knowledge files included.
// Both use the owner client, so RLS only finds the caller's own projects:
// another owner's id gets the same 404 as an unknown one.

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = "Project not found.";

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession("api/projects/:id PATCH");
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);
  const input = updateProjectRequestSchema.safeParse(await readJson(request));
  if (!input.success) return ownerError("invalid_input", "Send a project name of 1–80 characters.");

  try {
    const project = await renameProject(session.client, params.data.id, input.data.name);
    if (!project) return ownerError("not_found", NOT_FOUND);
    const body: UpdateProjectResponse = { project };
    return ownerJson(body);
  } catch (err) {
    return internalError("api/projects/:id PATCH", err);
  }
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession("api/projects/:id DELETE");
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);

  try {
    if (!(await deleteProject(session.client, params.data.id))) {
      return ownerError("not_found", NOT_FOUND);
    }
    // The RLS delete proved ownership; now remove the project's knowledge
    // files. The rows are gone either way, so a Storage failure only logs.
    try {
      await removeProjectFiles(createServiceClient(), params.data.id);
    } catch (err) {
      console.error(
        `[api/projects/:id DELETE] Couldn't remove files for project ${params.data.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
    const body: DeleteProjectResponse = { ok: true };
    return ownerJson(body);
  } catch (err) {
    return internalError("api/projects/:id DELETE", err);
  }
}
