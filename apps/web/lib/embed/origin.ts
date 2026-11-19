/**
 * The host page's origin, from the `origin` query param the loader sets.
 * Only a bare `http(s)` origin counts (no path, query or credentials).
 * Anything else → null, and the panel never posts a message.
 */
export function parseHostOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
}
