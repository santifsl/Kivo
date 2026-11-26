"use client";

import { ClerkFailed, ClerkLoaded, ClerkLoading, PricingTable, Show } from "@clerk/nextjs";
import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import { Button } from "../ui/button";
import { ErrorState } from "../ui/error-state";
import { GlassPanel } from "../ui/glass-panel";
import { LoadingState } from "../ui/loading-state";

const appearance = {
  variables: {
    colorPrimary: "var(--accent)",
    colorForeground: "var(--ink)",
    borderRadius: "var(--radius-md)",
  },
};
const loadingPlans = <LoadingState label="Loading subscription plans…" rows={2} />;

export function BillingPlans() {
  return (
    <GlassPanel as="section" aria-label="Subscription plans" className="min-w-0 p-4 sm:p-6">
      <ClerkLoading>{loadingPlans}</ClerkLoading>
      <ClerkLoaded>
        <PricingTable
          for="user"
          appearance={appearance}
          checkoutProps={{ appearance }}
          fallback={loadingPlans}
        />
      </ClerkLoaded>
      <ClerkFailed>
        <ErrorState
          title="Billing is unavailable"
          description="We couldn't load the subscription plans. Refresh the page to try again."
        />
      </ClerkFailed>
    </GlassPanel>
  );
}

export function ManageSubscriptionButton() {
  return (
    <Show when="signed-in">
      <SubscriptionDetailsButton for="user" subscriptionDetailsProps={{ appearance }}>
        <Button variant="secondary">Manage subscription</Button>
      </SubscriptionDetailsButton>
    </Show>
  );
}
