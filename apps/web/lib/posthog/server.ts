import "server-only";
import { PostHog } from "posthog-node";
import { readPosthogConfig } from "./config";

let client: PostHog | undefined;

export function getPosthogServer(): PostHog | undefined {
  if (client) return client;

  const config = readPosthogConfig();
  if (!config) return;

  try {
    client = new PostHog(config.key, {
      host: config.host,
      flushAt: 1,
      flushInterval: 0,
      requestTimeout: 1_000,
      captureAiRequestTimeoutMs: 1_000,
      fetchRetryCount: 0,
    });
    return client;
  } catch {
    return;
  }
}
