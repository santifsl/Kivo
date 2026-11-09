import { z } from "zod";
import type { OkResponse } from "../errors";

// System routes. docs/project.md §8.

/**
 * POST /api/clerk/webhook — body, parsed only after the signature is verified.
 * Clerk owns the payload; we read `type` and `data` and keep the rest.
 */
export const clerkWebhookEventSchema = z.looseObject({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
export type ClerkWebhookEvent = z.infer<typeof clerkWebhookEventSchema>;

/** POST /api/clerk/webhook — response. */
export type ClerkWebhookResponse = OkResponse;

/** GET /api/posthog-config — no input; response: PostHog's public project key and host. */
export interface PosthogConfigResponse {
  key: string;
  host: string;
}
