import {
  idParamsSchema,
  updateWidgetConfigRequestSchema,
  type UpdateWidgetConfigResponse,
} from "@kivo/shared";
import { getOwnerPlan } from "../../../../../lib/accounts/get-owner-plan";
import { internalError, ownerError, ownerJson, readJson } from "../../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../../lib/projects/owner-session";
import { getOwnedProject } from "../../../../../lib/projects/projects";
import { updateWidgetConfig } from "../../../../../lib/projects/widget-config";
import { createServiceClient } from "../../../../../lib/supabase/service";

type Context = { params: Promise<{ id: string }> };

const WHERE = "api/projects/:id/config PATCH";
const NOT_FOUND = "Project not found.";

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(WHERE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);
  const projectId = params.data.id;

  try {
    if (!(await getOwnedProject(session.client, projectId))) {
      return ownerError("not_found", NOT_FOUND);
    }

    const plan = await getOwnerPlan(async () => session.client);
    if (!plan) return internalError(WHERE, "Couldn't read the owner's plan.");
    if (plan === "free") {
      return ownerError("payment_required", "Upgrade to Pro to customize your widget.");
    }

    const input = updateWidgetConfigRequestSchema.safeParse(await readJson(request));
    if (!input.success) return ownerError("invalid_input", "Send valid widget config fields.");

    const config = await updateWidgetConfig(createServiceClient(), projectId, input.data);
    if (!config) return ownerError("not_found", "Widget config not found.");
    const body: UpdateWidgetConfigResponse = { config };
    return ownerJson(body);
  } catch (err) {
    return internalError(WHERE, err);
  }
}
