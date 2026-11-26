import "server-only";
import { after } from "next/server";
import { getPosthogServer } from "./server";

export function trackUpgrade(ownerId: string): void {
  try {
    const posthog = getPosthogServer();
    if (!posthog) return;

    after(async () => {
      try {
        await posthog.captureImmediate({ event: "upgraded", distinctId: ownerId });
      } catch {
        // The account plan has already changed, independent of analytics delivery.
      }
    });
  } catch {
    // Analytics is optional if client initialization or the request lifecycle fails.
  }
}
