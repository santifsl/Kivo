import { after } from "next/server";
import {
  createTextSourceRequestSchema,
  type CreateTextSourceResponse,
  idParamsSchema,
} from "@kivo/shared";
import { getOwnerPlan } from "../../../../../lib/accounts/get-owner-plan";
import { processSource } from "../../../../../lib/knowledge/process";
import {
  KnowledgeLimitError,
  ProjectGoneError,
  removeStorageObjects,
  reserveTextSource,
} from "../../../../../lib/knowledge/sources";
import { captureOwnerEvent } from "../../../../../lib/posthog/owner-events";
import { internalError, ownerError, ownerJson, readJson } from "../../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../../lib/projects/owner-session";
import { getOwnedProject } from "../../../../../lib/projects/projects";
import { createServiceClient } from "../../../../../lib/supabase/service";

// POST /api/projects/:id/knowledge: add a pasted text as a knowledge source.
// docs/project.md §6.4, §8 (Owner), §9.
//
// Ownership is checked with the owner client (RLS) before any service-client
// or OpenAI call. The source is reserved as `processing` under the plan's
// limit; chunking and embeddings run after the response.

type Context = { params: Promise<{ id: string }> };

const WHERE = "api/projects/:id/knowledge POST";
const NOT_FOUND = "Project not found.";

export async function POST(request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(WHERE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);
  const projectId = params.data.id;

  try {
    // RLS: another owner's project reads as missing, the same 404 as an unknown id.
    if (!(await getOwnedProject(session.client, projectId))) {
      return ownerError("not_found", NOT_FOUND);
    }

    const input = createTextSourceRequestSchema.safeParse(await readJson(request));
    if (!input.success) {
      return ownerError("invalid_input", "Send a title of 1–200 characters and some text.");
    }

    // The plan comes from the database, never from the request (§9 "Plan bypass").
    const plan = await getOwnerPlan(async () => session.client);
    if (!plan) return internalError(WHERE, "couldn't read the owner's plan");

    const service = createServiceClient();
    const { source, reclaimedStorageKeys } = await reserveTextSource(
      service,
      projectId,
      input.data.title,
      plan,
    );

    try {
      await removeStorageObjects(service, reclaimedStorageKeys);
    } catch (err) {
      // The new source is fine; the stale files are only left behind.
      console.error(`[${WHERE}]`, err instanceof Error ? err.message : err);
    }

    const content = input.data.content;
    after(async () => {
      if ((await processSource(source.id, projectId, content)) === "ready") {
        await captureOwnerEvent(session.userId, "knowledge_added", projectId);
      }
    });

    const body: CreateTextSourceResponse = { source };
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
