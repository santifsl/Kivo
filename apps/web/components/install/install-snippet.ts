import { WIDGET_SCRIPT_PATH } from "@kivo/shared/embed";

/** The request headers resolveAppOrigin reads (a subset of Next's `headers()`). */
export type OriginHeaders = Pick<Headers, "get">;

function toOrigin(url: string): string | null {
  try {
    const { origin, protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? origin : null;
  } catch {
    return null;
  }
}

/** First value of a header that proxies may send as a comma-separated list. */
function firstValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

/**
 * The app's origin for the install snippet: `NEXT_PUBLIC_APP_URL` when set,
 * otherwise this request's own origin (`x-forwarded-proto` + `host`), so a
 * preview deployment shows its own URL. Null when neither gives a valid
 * http(s) origin.
 */
export function resolveAppOrigin(
  envAppUrl: string | undefined,
  requestHeaders: OriginHeaders,
): string | null {
  const fromEnv = envAppUrl?.trim();
  if (fromEnv) return toOrigin(fromEnv);

  const host = firstValue(requestHeaders.get("host"));
  if (!host) return null;
  const proto = firstValue(requestHeaders.get("x-forwarded-proto")) ?? "https";
  return toOrigin(`${proto}://${host}`);
}

/** The project's install tag (docs/project.md §6.5). */
export function buildInstallSnippet(origin: string, publicKey: string): string {
  return `<script src="${origin}${WIDGET_SCRIPT_PATH}" data-key="${publicKey}" async></script>`;
}

/** The writer the copy button uses; `navigator.clipboard` in the browser. */
export type ClipboardWriter = { writeText(text: string): Promise<void> };

/** Writes `text` to the clipboard as-is. True on success. */
export async function copyText(
  text: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
