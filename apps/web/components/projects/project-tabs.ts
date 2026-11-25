export type ProjectTab = {
  label: string;
  /** The route segment under /dashboard/projects/[id]. */
  segment: string;
};

const KNOWLEDGE_TAB: ProjectTab = { label: "Knowledge", segment: "knowledge" };
const CUSTOMIZE_TAB: ProjectTab = { label: "Customize", segment: "customize" };
const INSTALL_TAB: ProjectTab = { label: "Install", segment: "install" };

export const CONVERSATIONS_TAB: ProjectTab = { label: "Conversations", segment: "conversations" };

export const PROJECT_TABS: readonly ProjectTab[] = [
  KNOWLEDGE_TAB,
  CONVERSATIONS_TAB,
  CUSTOMIZE_TAB,
  INSTALL_TAB,
];

/** Where /dashboard/projects/[id] redirects. Install for now (P3K-T07). */
export const DEFAULT_PROJECT_TAB: ProjectTab = INSTALL_TAB;

/** /dashboard/projects/<id> */
export function projectHref(projectId: string): string {
  return `/dashboard/projects/${encodeURIComponent(projectId)}`;
}

/** /dashboard/projects/<id>/<segment> */
export function projectTabHref(projectId: string, tab: ProjectTab): string {
  return `${projectHref(projectId)}/${tab.segment}`;
}

/** The tab whose page `pathname` is (or is under), or null. */
export function getActiveTab(
  pathname: string,
  projectId: string,
  tabs: readonly ProjectTab[] = PROJECT_TABS,
): ProjectTab | null {
  const path = pathname.replace(/\/+$/, "");
  return (
    tabs.find((tab) => {
      const href = projectTabHref(projectId, tab);
      return path === href || path.startsWith(`${href}/`);
    }) ?? null
  );
}
