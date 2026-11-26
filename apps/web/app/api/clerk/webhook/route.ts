import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { clerkWebhookEventSchema, type ClerkWebhookResponse } from "@kivo/shared";
import type { NextRequest } from "next/server";
import { personalProOwner } from "../../../../lib/billing/clerk-subscription";
import { reconcileAccountPlan } from "../../../../lib/billing/reconcile-account-plan";
import { trackUpgrade } from "../../../../lib/posthog/billing-events";
import { internalError, ownerError, ownerJson } from "../../../../lib/projects/http";

const response: ClerkWebhookResponse = { ok: true };

export async function POST(request: NextRequest): Promise<Response> {
  let verified: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    verified = await verifyWebhook(request);
  } catch {
    return ownerError("invalid_signature", "Invalid Clerk webhook signature.");
  }

  const event = clerkWebhookEventSchema.safeParse(verified);
  if (!event.success) {
    return ownerError("invalid_input", "Invalid Clerk webhook event.");
  }

  const ownerId = personalProOwner(event.data);
  if (!ownerId) return ownerJson(response);

  try {
    if (await reconcileAccountPlan(ownerId)) trackUpgrade(ownerId);
    return ownerJson(response);
  } catch (error) {
    return internalError("Clerk billing webhook", error);
  }
}
