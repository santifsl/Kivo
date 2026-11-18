/** Placeholder key in the example snippet; owners copy their real one from Install. */
export const EXAMPLE_PUBLIC_KEY = "pk_your_project_key";

const FALLBACK_APP_URL = "https://your-app-url";

/** The example install tag (docs/project.md §6.5), pointing at this deployment when known. */
export function buildInstallSnippet(appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): string {
  const base = (appUrl?.trim() || FALLBACK_APP_URL).replace(/\/+$/, "");
  return `<script src="${base}/widget.js" data-key="${EXAMPLE_PUBLIC_KEY}" async></script>`;
}
