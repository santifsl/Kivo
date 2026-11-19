import { API_ERROR_STATUS, type ApiError, type ApiErrorCode } from "@kivo/shared";

/**
 * Headers for every response of the public widget config route.
 * Any site may embed the widget, so any origin may read it, without
 * credentials (docs/project.md §9 "CORS"). `no-store` so a saved config shows
 * on the next load.
 */
export const WIDGET_CONFIG_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

/** Extra headers for the CORS preflight. */
export const WIDGET_CONFIG_PREFLIGHT_HEADERS = {
  ...WIDGET_CONFIG_HEADERS,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
} as const;

/** `{ error: { code, message } }` with the code's status and the route's headers. */
export function widgetErrorResponse(code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status: API_ERROR_STATUS[code], headers: WIDGET_CONFIG_HEADERS });
}
