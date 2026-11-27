import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { ProjectHeader } from "@/components/projects/project-header";
import { loadOwnedProject } from "@/components/projects/load-owned-project";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";

// Every project page: the header (breadcrumb, name, status, usage). The
// sections are in the sidebar (components/dashboard/nav.ts).
// An unknown or not-owned id is not-found (loadOwnedProject).
export default async function ProjectLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ id: string }> }>) {
  await auth.protect();
  const { id } = await params;
  const [project, plan] = await Promise.all([loadOwnedProject(id), getOwnerPlan()]);

  return (
    <>
      <ProjectHeader project={project} plan={plan} />
      {children}
    </>
  );
}
