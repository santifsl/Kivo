import { widgetConfigQuerySchema, type WidgetConfigResponse } from "@kivo/shared";
import { getWidgetConfig } from "../../../../lib/widget-config/get-widget-config";
import {
  WIDGET_CONFIG_HEADERS,
  WIDGET_CONFIG_PREFLIGHT_HEADERS,
  widgetErrorResponse,
} from "../../../../lib/widget-config/http";

// GET /api/widget/config?key=pk_… — public, any origin (docs/project.md §6.5, §8).
// Returns only the plan-applied config: never the owner id or the plan.

export async function GET(request: Request): Promise<Response> {
  const query = widgetConfigQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) return widgetErrorResponse("invalid_input", "Invalid widget key.");

  try {
    const config = await getWidgetConfig(query.data.key);
    if (!config) return widgetErrorResponse("not_found", "Unknown widget key.");

    const body: WidgetConfigResponse = { config };
    return Response.json(body, { headers: WIDGET_CONFIG_HEADERS });
  } catch (err) {
    console.error("[api/widget/config]", err instanceof Error ? err.message : err);
    return widgetErrorResponse("internal", "Something went wrong.");
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: WIDGET_CONFIG_PREFLIGHT_HEADERS });
}
