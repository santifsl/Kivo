import {
  createProjectRequestSchema,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@kivo/shared";
import { ensureAccount } from "../../../lib/accounts/ensure-account";
import { getOwnerPlan } from "../../../lib/accounts/get-owner-plan";
import { unauthorizedResponse } from "../../../lib/auth/errors";
import { internalError, ownerError, ownerJson, readJson } from "../../../lib/projects/http";
import { getOwnerSession } from "../../../lib/projects/owner-session";
import { createProject, listProjects, ProjectLimitError } from "../../../lib/projects/projects";

// GET  /api/projects: the caller's projects (RLS-scoped) and their plan.
// POST /api/projects: create a project under the plan's limit.
// docs/project.md §6.3, §8 (Owner).

export async function GET(): Promise<Response> {
  const session = await getOwnerSession();
  if (!session) return unauthorizedResponse();

  try {
    const [projects, plan] = await Promise.all([
      listProjects(session.client),
      getOwnerPlan(async () => session.client),
    ]);
    if (!plan) return internalError("api/projects GET", "couldn't read the owner's plan");

    const body: ListProjectsResponse = { projects, plan };
    return ownerJson(body);
  } catch (err) {
    return internalError("api/projects GET", err);
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await getOwnerSession();
  if (!session) return unauthorizedResponse();

  const input = createProjectRequestSchema.safeParse(await readJson(request));
  if (!input.success) return ownerError("invalid_input", "Send a project name of 1–80 characters.");

  try {
    await ensureAccount(session.userId);
    // The plan comes from the database, never from the request (§9 "Plan bypass").
    const plan = await getOwnerPlan(async () => session.client);
    if (!plan) return internalError("api/projects POST", "couldn't read the owner's plan");

    const project = await createProject(session.userId, input.data.name, plan);
    const body: CreateProjectResponse = { project };
    return ownerJson(body, 201);
  } catch (err) {
    if (err instanceof ProjectLimitError) {
      return ownerError("plan_limit", "Your plan's project limit is reached. Upgrade to add more.");
    }
    return internalError("api/projects POST", err);
  }
}
