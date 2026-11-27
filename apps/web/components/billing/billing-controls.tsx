"use client";

import type { Plan } from "@kivo/shared";
import { ClerkFailed, ClerkLoaded, ClerkLoading, PricingTable, Show, useAuth } from "@clerk/nextjs";
import { ArrowDown } from "lucide-react";
import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES, Button } from "../ui/button";
import { cn } from "../ui/cn";
import { ErrorState } from "../ui/error-state";
import { Card } from "../ui/card";
import { LoadingState } from "../ui/loading-state";
import { useClerkAppearance } from "../auth/clerk-appearance";
import { PLANS_ID } from "./current-plan";

const loadingPlans = <LoadingState label="Loading subscription plans…" rows={2} />;

export function BillingPlans() {
  const appearance = useClerkAppearance();
  return (
    <Card
      as="section"
      id={PLANS_ID}
      aria-label="Subscription plans"
      className="min-w-0 scroll-mt-6 p-4 sm:p-6"
    >
      <ClerkLoading>{loadingPlans}</ClerkLoading>
      <ClerkLoaded>
        {appearance ? (
          <PricingTable
            for="user"
            appearance={appearance}
            checkoutProps={{ appearance }}
            fallback={loadingPlans}
          />
        ) : (
          loadingPlans
        )}
      </ClerkLoaded>
      <ClerkFailed>
        <ErrorState
          title="Billing is unavailable"
          description="We couldn't load the subscription plans. Refresh the page to try again."
        />
      </ClerkFailed>
    </Card>
  );
}

export function ManageSubscriptionButton() {
  const appearance = useClerkAppearance() ?? undefined;
  return (
    <Show when="signed-in">
      <SubscriptionDetailsButton for="user" subscriptionDetailsProps={{ appearance }}>
        <Button variant="secondary">Manage subscription</Button>
      </SubscriptionDetailsButton>
    </Show>
  );
}

/**
 * The current-plan card's action. Free has no subscription to manage, so it points to the plans.
 * Right after checkout Clerk already has the Pro subscription while our account row can still
 * say Free (the webhook is pending): then Clerk's own plan check wins and Manage shows.
 */
export function PlanAction({ plan }: { plan: Plan | null }) {
  const { has } = useAuth();
  const clerkPro = has?.({ plan: "pro" }) ?? false;
  if (plan === "free" && !clerkPro) {
    return (
      <a href={`#${PLANS_ID}`} className={cn(BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES.primary)}>
        Upgrade to Pro
        <ArrowDown aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </a>
    );
  }
  return <ManageSubscriptionButton />;
}
