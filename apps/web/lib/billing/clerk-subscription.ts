import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { ClerkWebhookEvent, Plan } from "@kivo/shared";

export function personalProOwner({ type, data }: ClerkWebhookEvent): string | undefined {
  if (
    type !== "subscriptionItem.active" &&
    type !== "subscriptionItem.ended" &&
    type !== "subscriptionItem.canceled"
  ) {
    return;
  }

  const { payer, plan } = data;
  if (!plan || typeof plan !== "object" || !("slug" in plan) || plan.slug !== "pro") return;
  if (!payer || typeof payer !== "object") return;
  if ("organization_id" in payer && payer.organization_id != null && payer.organization_id !== "")
    return;
  if ("user_id" in payer && typeof payer.user_id === "string" && payer.user_id) {
    return payer.user_id;
  }
}

export async function getPersonalBillingPlan(ownerId: string): Promise<Plan> {
  const clerk = await clerkClient();
  const { subscriptionItems } = await clerk.billing.getUserBillingSubscription(ownerId);
  const now = Date.now();

  const hasPro = subscriptionItems.some(({ plan, status, periodEnd }) => {
    if (plan?.slug !== "pro") return false;
    return status === "active" || (status === "canceled" && periodEnd !== null && periodEnd > now);
  });
  return hasPro ? "pro" : "free";
}
