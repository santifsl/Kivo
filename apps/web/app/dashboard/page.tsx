import { auth } from "@clerk/nextjs/server";
import { ensureAccount } from "@/lib/accounts/ensure-account";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";
import { getOwnerSession } from "@/lib/projects/owner-session";
import { listProjects } from "@/lib/projects/projects";
import { ProjectsView } from "@/components/projects/projects-view";
import { PageHeader } from "@/components/ui/page-header";

export default async function ProjectsPage() {
  const { userId } = await auth.protect();
  // The layout also does this, but renders in parallel: a first visit must have the row before the plan is read.
  await ensureAccount(userId);

  const session = await getOwnerSession();
  if (!session) throw new Error("No owner session on the projects page.");

  // Read on the server with the owner client: RLS scopes both to this owner.
  // A failure throws to app/dashboard/error.tsx (the error state).
  const [projects, plan] = await Promise.all([
    listProjects(session.client),
    getOwnerPlan(async () => session.client),
  ]);
  if (!plan) throw new Error("Couldn't read the owner's plan.");

  return (
    <>
      <PageHeader title="Projects" description="Each project is one website with its own chat widget." />
      <ProjectsView projects={projects} plan={plan} />
    </>
  );
}
