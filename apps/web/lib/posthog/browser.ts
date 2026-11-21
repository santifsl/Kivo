import type { PosthogConfigResponse } from "@kivo/shared";
import type { PostHog, PostHogInterface } from "posthog-js";
import { normalizePath, SIGN_IN_PATH } from "../auth/routes";
import { canRecordReplay, isWidgetPath } from "./routes";

let client: PostHog | undefined;
let initialization: Promise<PostHog | undefined> | undefined;
let replayPath: string | undefined;
let replayEnabled = false;

function applyOwner(posthog: PostHogInterface, ownerId: string | null): void {
  const previous = posthog.get_property("$user_id");
  if (previous === ownerId) return;
  if (previous) posthog.reset();
  if (ownerId) posthog.identify(ownerId);
}

function resetOnSignIn(posthog: PostHogInterface): void {
  const path = normalizePath(window.location.pathname);
  if (path === SIGN_IN_PATH || path.startsWith(`${SIGN_IN_PATH}/`)) {
    applyOwner(posthog, null);
  }
}

async function initialize(): Promise<PostHog | undefined> {
  const response = await fetch("/api/posthog-config", { cache: "no-store" });
  if (response.status === 204) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "PostHog disabled. Configure NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST.",
      );
    }
    return;
  }
  if (!response.ok) return;

  const { key, host } = (await response.json()) as PosthogConfigResponse;
  if (!key || !host) return;
  const { default: posthog } = await import("posthog-js");

  // Navigation may finish while the config request or SDK import is pending.
  const pathname = window.location.pathname;
  if (isWidgetPath(pathname)) {
    initialization = undefined;
    return;
  }
  replayEnabled = canRecordReplay(replayPath ?? pathname);
  posthog.init(key, {
    api_host: host,
    defaults: "2026-08-30",
    autocapture: false,
    capture_exceptions: true,
    // Clerk redirects here on sign-out, including full document navigations.
    loaded: resetOnSignIn,
    disable_session_recording: !replayEnabled,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      blockSelector: 'iframe, input[type="file"]',
      captureJsonLd: false,
      streamNetworkBody: false,
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: request.name.replace(/[?#].*$/, ""),
      }),
    },
    before_send: (event) => (isWidgetPath(window.location.pathname) ? null : event),
  });
  client = posthog;
  return client;
}

export function getPosthogBrowser(): Promise<PostHog | undefined> {
  if (isWidgetPath(window.location.pathname)) return Promise.resolve(undefined);
  return (initialization ??= initialize().catch(() => undefined));
}

export function updatePosthogReplay(pathname: string): void {
  replayPath = pathname;
  const shouldRecord = canRecordReplay(pathname);
  if (!client) return;

  try {
    if (window.location.pathname === pathname) resetOnSignIn(client);
    if (replayEnabled === shouldRecord) return;
    client.set_config({ disable_session_recording: !shouldRecord });
    replayEnabled = shouldRecord;
  } catch {
    // Keep navigation independent of analytics.
  }
}

export async function syncPosthogOwner(ownerId: string | null, isCurrent: () => boolean) {
  try {
    const posthog = await getPosthogBrowser();
    if (posthog && isCurrent()) applyOwner(posthog, ownerId);
  } catch {
    // Identity tracking is optional.
  }
}

export async function captureSnippetCopied(
  ownerId: string,
  projectId: string,
  isCurrent: () => boolean,
) {
  try {
    const posthog = await getPosthogBrowser();
    if (!posthog || !isCurrent()) return;
    applyOwner(posthog, ownerId);
    posthog.capture("snippet_copied", { project_id: projectId });
  } catch {
    // The clipboard result is independent of analytics delivery.
  }
}

export async function capturePosthogBrowserError(error: Error): Promise<void> {
  try {
    const posthog = await getPosthogBrowser();
    if (!isWidgetPath(window.location.pathname)) posthog?.captureException(error);
  } catch {
    // The error boundary must render even if reporting fails.
  }
}
