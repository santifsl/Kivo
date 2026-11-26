import { auth } from "@clerk/nextjs/server";
import {
  BillingPlans,
  ManageSubscriptionButton,
} from "../../../components/billing/billing-controls";
import { PageHeader } from "../../../components/ui/page-header";

export default async function BillingPage() {
  await auth.protect();
  return (
    <>
      <PageHeader title="Billing" actions={<ManageSubscriptionButton />} />
      <BillingPlans />
    </>
  );
}
