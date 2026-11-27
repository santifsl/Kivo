import { auth } from "@clerk/nextjs/server";
import { BillingPlans } from "../../../components/billing/billing-controls";
import { CurrentPlanCard } from "../../../components/billing/current-plan-card";
import { PageHeader } from "../../../components/ui/page-header";
import { getOwnerPlan } from "../../../lib/accounts/get-owner-plan";

export default async function BillingPage() {
  await auth.protect();
  // Read on the server with the owner client (RLS); null shows "Plan unavailable".
  const plan = await getOwnerPlan();
  return (
    <>
      <PageHeader title="Billing" description="Your plan, and the plans you can switch to." />
      <CurrentPlanCard plan={plan} />
      <BillingPlans />
    </>
  );
}
