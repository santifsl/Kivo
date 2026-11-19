import { auth } from "@clerk/nextjs/server";
import { loadOwnedProject } from "@/components/projects/load-owned-project";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassPanel } from "@/components/ui/glass-panel";

// Placeholder: A5 builds the Install tab.
export default async function InstallPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  await auth.protect();
  await loadOwnedProject((await params).id);
  return (
    <GlassPanel as="section">
      <EmptyState title="Install" description="Your widget's install code will show here." />
    </GlassPanel>
  );
}
