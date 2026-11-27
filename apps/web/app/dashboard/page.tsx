import { auth } from "@clerk/nextjs/server";
import { ensureAccount } from "@/lib/accounts/ensure-account";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";
import { loadOwnerProjects } from "@/components/projects/load-owner-projects";
import { ProjectsView } from "@/components/projects/projects-view";
import { PageHeader } from "@/components/ui/page-header";

export default async function ProjectsPage() {
  const { userId } = await auth.protect();
  // The layout also does this, but renders in parallel: a first visit must have the row before the plan is read.
  await ensureAccount(userId);

  // Read on the server with the owner client: RLS scopes both to this owner.
  // A failure throws to app/dashboard/error.tsx (the error state). The list is
  // the same cached read the layout's project switcher uses.
  const [projects, plan] = await Promise.all([loadOwnerProjects(), getOwnerPlan()]);
  if (!plan) throw new Error("Couldn't read the owner's plan.");

  return (
    <>
      <PageHeader title="Projects" description="Each project is one website with its own chat widget." />
      <ProjectsView projects={projects} plan={plan} />
    </>
  );
}
