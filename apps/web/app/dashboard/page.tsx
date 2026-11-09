import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassPanel } from "@/components/ui/glass-panel";
import { PageHeader } from "@/components/ui/page-header";

export default async function ProjectsPage() {
  await auth.protect();
  return (
    <>
      <PageHeader title="Projects" description="Each project is one website with its own chat widget." />
      <GlassPanel as="section">
        <EmptyState
          title="No projects yet"
          description="Create a project to add your knowledge and get the widget's install code."
          // Phase 2 wires project creation.
          action={<Button disabled>New project</Button>}
        />
      </GlassPanel>
    </>
  );
}
