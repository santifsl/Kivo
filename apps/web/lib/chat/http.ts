import { WIDGET_CONFIG_HEADERS } from "../widget-config/http";

/**
 * Headers for every response of POST /api/widget/chat: the same as the config
 * route (any origin, no credentials, no-store; docs/project.md §9 "CORS").
 */
export const CHAT_HEADERS = WIDGET_CONFIG_HEADERS;

/** Preflight: the widget sends JSON, so `Content-Type` must be allowed. */
export const CHAT_PREFLIGHT_HEADERS = {
  ...CHAT_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

/**
 * Largest body we read. A valid request is far smaller (1,000-character
 * message plus ids), so anything bigger is refused before parsing.
 */
export const MAX_CHAT_BODY_BYTES = 16 * 1024;
