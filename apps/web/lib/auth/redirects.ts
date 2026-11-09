/**
 * Guard for Clerk's development-instance sync redirect. Pure: no Clerk, no Next imports.
 *
 * On a development instance (every preview), clerkMiddleware answers any request carrying
 * `?__clerk_redirect_url=<url>` with a redirect to <url> plus the browser's dev-browser token
 * (`__clerk_db_jwt`). That runs before our route callback, so a crafted link would hand the
 * token to any site. We have no satellite domains, so only our own origin is trusted.
 */
export const CLERK_REDIRECT_PARAM = "__clerk_redirect_url";

/**
 * Returns the URL with every untrusted `__clerk_redirect_url` removed, or null when the request
 * has none (nothing to strip). A value is trusted only if it parses to the request's own origin.
 */
export function stripUntrustedClerkRedirect(requestUrl: URL): URL | null {
  const values = requestUrl.searchParams.getAll(CLERK_REDIRECT_PARAM);
  if (values.length === 0) return null;
  if (values.every((value) => isSameOrigin(value, requestUrl.origin))) return null;

  const cleaned = new URL(requestUrl);
  cleaned.searchParams.delete(CLERK_REDIRECT_PARAM);
  return cleaned;
}

function isSameOrigin(value: string, origin: string): boolean {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}
