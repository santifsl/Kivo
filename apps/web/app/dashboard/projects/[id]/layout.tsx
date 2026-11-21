import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { loadOwnedProject } from "@/components/projects/load-owned-project";
import { ProjectTabsNav } from "@/components/projects/project-tabs-nav";
import { ProjectUsage } from "@/components/projects/project-usage";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";

// The project page: name, a link back, and the tabs (components/projects/project-tabs.ts).
// An unknown or not-owned id is a 404 (loadOwnedProject).
export default async function ProjectLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ id: string }> }>) {
  await auth.protect();
  const { id } = await params;
  const [project, plan] = await Promise.all([loadOwnedProject(id), getOwnerPlan()]);

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link href="/dashboard" className="w-fit text-sm text-ink-muted hover:text-ink">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight break-words text-ink">
          {project.name}
        </h1>
        <ProjectUsage project={project} plan={plan} />
        <div className="border-b border-line">
          <ProjectTabsNav projectId={project.id} />
        </div>
      </header>
      {children}
    </>
  );
}
