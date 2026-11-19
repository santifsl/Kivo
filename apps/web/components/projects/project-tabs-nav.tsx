"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui/cn";
import { getActiveTab, PROJECT_TABS, projectTabHref, type ProjectTab } from "./project-tabs";

export function ProjectTabsView({
  projectId,
  activeSegment,
  tabs = PROJECT_TABS,
}: {
  projectId: string;
  activeSegment: string | null;
  tabs?: readonly ProjectTab[];
}) {
  return (
    <nav aria-label="Project" className="-mb-px overflow-x-auto">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const active = tab.segment === activeSegment;
          return (
            <li key={tab.segment}>
              <Link
                href={projectTabHref(projectId, tab)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  active ? "border-ink font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The project tabs, with the current page's tab marked. */
export function ProjectTabsNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return <ProjectTabsView projectId={projectId} activeSegment={getActiveTab(pathname, projectId)?.segment ?? null} />;
}
