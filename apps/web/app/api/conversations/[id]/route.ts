import { idParamsSchema } from "@kivo/shared";
import { getConversation } from "../../../../lib/conversations/conversations";
import { internalError, ownerError, ownerJson } from "../../../../lib/projects/http";
import { requireOwnerSession } from "../../../../lib/projects/owner-session";

type Context = { params: Promise<{ id: string }> };
const ROUTE = "api/conversations/:id GET";
const NOT_FOUND = "Conversation not found.";

export async function GET(_request: Request, context: Context): Promise<Response> {
  const session = await requireOwnerSession(ROUTE);
  if (session instanceof Response) return session;

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return ownerError("not_found", NOT_FOUND);

  try {
    const thread = await getConversation(session.client, params.data.id);
    return thread ? ownerJson(thread) : ownerError("not_found", NOT_FOUND);
  } catch (error) {
    return internalError(ROUTE, error);
  }
}
