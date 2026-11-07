/**
 * Which routes need a signed-in owner. Pure: no Clerk, no Next imports, so it is unit-tested.
 *
 * - "page": owner pages. Signed-out → redirect to sign-in.
 * - "owner-api": owner API routes. Signed-out → 401 JSON (never a redirect).
 * - "public": everything else (landing, sign-in/up, embed, widget API, Clerk webhook, PostHog config).
 */
export type RouteAccess = "page" | "owner-api" | "public";

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const AFTER_AUTH_PATH = "/dashboard";
export const AFTER_SIGN_OUT_PATH = SIGN_IN_PATH;

/** Owner pages (prefix match on whole path segments). */
export const PROTECTED_PAGE_PREFIXES = ["/dashboard"] as const;

/** Owner API routes (prefix match on whole path segments). */
export const OWNER_API_PREFIXES = ["/api/projects", "/api/knowledge", "/api/conversations"] as const;

/** Documented public routes. Not used for matching (unlisted routes are public); kept for tests and readers. */
export const PUBLIC_PREFIXES = [
  "/",
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  "/embed",
  "/api/widget",
  "/api/clerk",
  "/api/posthog-config",
] as const;

/** True when `pathname` is `prefix` or a sub-path of it (`/dashboard`, `/dashboard/x`, not `/dashboards`). */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Lowercase, collapse repeated slashes and drop a trailing slash, so `//Dashboard/` can't slip past. */
export function normalizePath(pathname: string): string {
  const collapsed = pathname.toLowerCase().replace(/\/{2,}/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

export function classifyRoute(pathname: string): RouteAccess {
  const path = normalizePath(pathname);
  if (OWNER_API_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) return "owner-api";
  if (PROTECTED_PAGE_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) return "page";
  return "public";
}
