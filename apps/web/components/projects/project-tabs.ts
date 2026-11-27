// The sections of a project, shown in the dashboard sidebar. Overview is the
// project page itself (/dashboard/projects/[id]); the others are under it.

export type ProjectTabIcon = "overview" | "knowledge" | "conversations" | "customize" | "install";

export type ProjectTab = {
  label: string;
  /** The route segment under /dashboard/projects/[id]. Empty for Overview (the project page). */
  segment: string;
  icon: ProjectTabIcon;
};

export const OVERVIEW_TAB: ProjectTab = { label: "Overview", segment: "", icon: "overview" };
export const KNOWLEDGE_TAB: ProjectTab = { label: "Knowledge", segment: "knowledge", icon: "knowledge" };
export const CONVERSATIONS_TAB: ProjectTab = {
  label: "Conversations",
  segment: "conversations",
  icon: "conversations",
};
export const CUSTOMIZE_TAB: ProjectTab = { label: "Customize", segment: "customize", icon: "customize" };
export const INSTALL_TAB: ProjectTab = { label: "Install", segment: "install", icon: "install" };

export const PROJECT_TABS: readonly ProjectTab[] = [
  OVERVIEW_TAB,
  KNOWLEDGE_TAB,
  CONVERSATIONS_TAB,
  CUSTOMIZE_TAB,
  INSTALL_TAB,
];

/** Where a project opens: its Overview. */
export const DEFAULT_PROJECT_TAB: ProjectTab = OVERVIEW_TAB;

/** /dashboard/projects/<id> */
export function projectHref(projectId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}`;
}

/** /dashboard/projects/<id>/<segment>, or the project page for Overview. */
export function projectTabHref(projectId: string, tab: ProjectTab): string {
  return tab.segment ? `${projectHref(projectId)}/${tab.segment}` : projectHref(projectId);
}

/**
 * The tab whose page `pathname` is (or is under), or null. Overview only
 * matches the project page itself; every other page is under a section.
 */
export function getActiveTab(
  pathname: string,
  projectId: string,
  tabs: readonly ProjectTab[] = PROJECT_TABS,
): ProjectTab | null {
  const path = pathname.replace(/\/+$/, "");
  return (
    tabs.find((tab) => {
      const href = projectTabHref(projectId, tab);
      return tab.segment ? path === href || path.startsWith(`${href}/`) : path === href;
    }) ?? null
  );
}
