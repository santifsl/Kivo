/**
 * Message contract between the widget loader (`widget.js`, on the customer's
 * site) and the chat panel (`/embed`, our iframe). docs/project.md §6.5, §9.
 *
 * This file has NO imports (no zod): the loader imports it alone through
 * `@kivo/shared/embed` and must stay under 5 kb. Keep it that way.
 *
 * Origin rules (§9 "postMessage"):
 * - Loader: accepts a message only when `event.origin` is the app origin (the
 *   origin `widget.js` was served from) AND `event.source` is its own iframe's
 *   `contentWindow`. It posts to the iframe with the app origin as targetOrigin.
 * - Panel: accepts a message only when `event.origin` equals the `origin`
 *   query value (the host page's origin, set by the loader). It posts to
 *   `window.parent` with that same origin as targetOrigin.
 * - Neither side ever posts with `"*"`.
 * - The guards below check shape only. Always check the origin (and source
 *   window) first, then the guard.
 */

/** Path of the loader script on the app origin. */
export const WIDGET_SCRIPT_PATH = "/widget.js";

/** Path of the chat panel page loaded in the iframe. */
export const EMBED_PATH = "/embed";

/** Query parameter names of the embed URL: `/embed?key=pk_…&origin=https://host.example`. */
export const EMBED_QUERY = {
  /** The project's public key (`pk_…`). */
  key: "key",
  /** The host page's origin; the panel's only accepted origin and its postMessage target. */
  origin: "origin",
} as const;

/** `source` tag on every panel → loader message. Messages without it are ignored. */
export const PANEL_MESSAGE_SOURCE = "embed-panel/v1";

/** `source` tag on every loader → panel message. Messages without it are ignored. */
export const LOADER_MESSAGE_SOURCE = "embed-loader/v1";

type FromPanel<T> = { source: typeof PANEL_MESSAGE_SOURCE } & T;
type FromLoader<T> = { source: typeof LOADER_MESSAGE_SOURCE } & T;

/** Panel → loader. */
export type PanelMessage =
  /** The panel has loaded and can receive `visibility`. */
  | FromPanel<{ type: "ready" }>
  /** The visitor closed the panel. */
  | FromPanel<{ type: "close" }>
  /** The panel's content height in CSS pixels (finite, ≥ 0). */
  | FromPanel<{ type: "resize"; height: number }>
  /** Bot replies the visitor hasn't seen (integer, ≥ 0). */
  | FromPanel<{ type: "unread"; count: number }>;

/** Loader → panel. */
export type LoaderMessage =
  /** The panel was opened or closed. */
  FromLoader<{ type: "visibility"; open: boolean }>;

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** True when `data` is a well-formed panel → loader message. Check `event.origin` first. */
export function isPanelMessage(data: unknown): data is PanelMessage {
  if (!isRecord(data) || data.source !== PANEL_MESSAGE_SOURCE) return false;
  switch (data.type) {
    case "ready":
    case "close":
      return true;
    case "resize":
      return isNonNegativeNumber(data.height);
    case "unread":
      return isNonNegativeNumber(data.count) && Number.isSafeInteger(data.count);
    default:
      return false;
  }
}

/** True when `data` is a well-formed loader → panel message. Check `event.origin` first. */
export function isLoaderMessage(data: unknown): data is LoaderMessage {
  if (!isRecord(data) || data.source !== LOADER_MESSAGE_SOURCE) return false;
  return data.type === "visibility" && typeof data.open === "boolean";
}
