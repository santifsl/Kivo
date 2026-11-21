import { idParamsSchema, type ListConversationsResponse } from "@kivo/shared";
import { listConversations } from "../../../../../lib/conversations/conversations";
import { internalError, ownerError, ownerJson } from "../../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../../lib/projects/owner-session";

type Context = { params: Promise<{ id: string }> };
const ROUTE = "api/projects/:id/conversations GET";
const NOT_FOUND = "Project not found.";

export async function GET(_request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(ROUTE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);

  try {
    const conversations = await listConversations(session.client, params.data.id);
    if (!conversations) return ownerError("not_found", NOT_FOUND);
    const body: ListConversationsResponse = { conversations };
    return ownerJson(body);
  } catch (error) {
    return internalError(ROUTE, error);
  }
}
