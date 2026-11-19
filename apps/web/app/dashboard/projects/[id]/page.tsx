import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { loadOwnedProject } from "@/components/projects/load-owned-project";
import { DEFAULT_PROJECT_TAB, projectTabHref } from "@/components/projects/project-tabs";

export default async function ProjectPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  await auth.protect();
  const { id } = await params;
  // 404 before redirecting, so a bad id never lands on a tab URL.
  const project = await loadOwnedProject(id);
  redirect(projectTabHref(project.id, DEFAULT_PROJECT_TAB));
}
