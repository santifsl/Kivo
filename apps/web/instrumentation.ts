import type { Instrumentation } from "next";
import { isWidgetPath } from "./lib/posthog/routes";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { getPosthogServer } = await import("./lib/posthog/server");
    if (!getPosthogServer() && process.env.NODE_ENV === "development") {
      console.warn(
        "PostHog disabled. Configure NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST.",
      );
    }
  } catch {
    // The server must start even if analytics fails to load.
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || isWidgetPath(request.path.replace(/\?.*$/, ""))) {
    return;
  }

  try {
    const { getPosthogServer } = await import("./lib/posthog/server");
    await getPosthogServer()?.captureExceptionImmediate(error, {
      properties: {
        route: context.routePath,
        route_type: context.routeType,
        $process_person_profile: false,
      },
    });
  } catch {
    // Reporting must never replace the original error.
  }
};
