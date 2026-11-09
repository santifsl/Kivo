import { auth } from "@clerk/nextjs/server";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassPanel } from "@/components/ui/glass-panel";
import { PageHeader } from "@/components/ui/page-header";

export default async function BillingPage() {
  await auth.protect();
  return (
    <>
      <PageHeader title="Billing" description="Your plan and subscription." />
      <GlassPanel as="section">
        <EmptyState title="Billing is coming soon" description="Plans and upgrades will show here." />
      </GlassPanel>
    </>
  );
}
