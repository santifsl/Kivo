import { auth } from "@clerk/nextjs/server";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";
import { getOwnerSession } from "@/lib/projects/owner-session";
import { KnowledgeView } from "@/components/knowledge/knowledge-view";
import { loadSources } from "@/components/knowledge/load-sources";
import { loadOwnedProject } from "@/components/projects/load-owned-project";

export default async function KnowledgePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await auth.protect();
  // Owner client + RLS: an unknown or not-owned id is a 404, before any source is read.
  const project = await loadOwnedProject((await params).id);

  const session = await getOwnerSession();
  if (!session) throw new Error("No owner session on the knowledge page.");

  // Both read on the server with the owner client; a failure shows error.tsx.
  const [sources, plan] = await Promise.all([
    loadSources(session.client, project.id),
    getOwnerPlan(async () => session.client),
  ]);
  if (!plan) throw new Error("Couldn't read the owner's plan.");

  return <KnowledgeView projectId={project.id} sources={sources} plan={plan} />;
}
