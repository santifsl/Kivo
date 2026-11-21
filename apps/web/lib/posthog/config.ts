import "server-only";
import type { PosthogConfigResponse } from "@kivo/shared";

export function readPosthogConfig(): PosthogConfigResponse | undefined {
  // Indirect reads keep Next.js from inlining NEXT_PUBLIC_* at build time.
  const env = process.env;
  const key = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = env.NEXT_PUBLIC_POSTHOG_HOST?.trim();

  // Only project tokens may cross the public config endpoint.
  if (!key?.startsWith("phc_") || key.length === 4 || !host) return;

  try {
    const url = new URL(host);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return;
    }

    return { key, host: url.origin };
  } catch {
    return;
  }
}
