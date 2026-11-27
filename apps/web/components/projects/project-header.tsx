import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Plan, Project } from "@kivo/shared";
import { Badge } from "../ui/badge";
import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES } from "../ui/button";
import { cn } from "../ui/cn";
import { PageHeader } from "../ui/page-header";
import { PROJECTS_HREF } from "../dashboard/nav";
import { ProjectUsage } from "./project-usage";
import { INSTALL_TAB, projectTabHref } from "./project-tabs";

/** "Projects / Acme Co.", the serif name, Active, "View widget ↗" and the month's usage. */
export function ProjectHeader({
  project,
  plan,
  now,
}: {
  project: Pick<Project, "id" | "name" | "messages_used" | "period_start">;
  plan: Plan | null;
  now?: Date;
}) {
  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        breadcrumb={
          <ol className="flex min-w-0 items-center gap-1.5">
            <li>
              <Link href={PROJECTS_HREF} className="hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
                Projects
              </Link>
            </li>
            <li aria-hidden="true" className="text-ink-subtle">
              /
            </li>
            <li aria-current="page" className="min-w-0 truncate text-ink">
              {project.name}
            </li>
          </ol>
        }
        title={project.name}
        badge={<Badge variant="success">Active</Badge>}
        actions={
          <Link
            href={projectTabHref(project.id, INSTALL_TAB)}
            className={cn(BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES.secondary)}
          >
            View widget
            <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </Link>
        }
      />
      <ProjectUsage project={project} plan={plan} now={now} />
    </div>
  );
}
