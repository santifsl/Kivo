import { getPosthogBrowser, updatePosthogReplay } from "./lib/posthog/browser";
import { canRecordReplay } from "./lib/posthog/routes";

void getPosthogBrowser();

export function onRouterTransitionStart(url: string): void {
  const { pathname } = new URL(url, window.location.href);
  // Stop recording before an excluded route renders. The committed route resumes it.
  if (!canRecordReplay(pathname)) updatePosthogReplay(pathname);
}
