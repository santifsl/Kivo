import { auth } from "@clerk/nextjs/server";
import { loadOverview } from "@/components/overview/load-overview";
import { OverviewView } from "@/components/overview/overview-view";
import { loadOwnedProject } from "@/components/projects/load-owned-project";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";
import { getOwnerSession } from "@/lib/projects/owner-session";

// The project's Overview: usage, counts and the latest conversations. Every
// read uses the owner client (RLS); another owner's id is not-found.
export default async function ProjectOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await params;
  const project = await loadOwnedProject(id);
  const session = await getOwnerSession();
  if (!session) throw new Error("No owner session on the Overview page.");
  const [plan, data] = await Promise.all([getOwnerPlan(async () => session.client), loadOverview(session.client, project.id)]);
  return <OverviewView project={project} plan={plan} data={data} />;
}
