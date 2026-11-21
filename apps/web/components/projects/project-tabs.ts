// The project page's tabs, in order. Later phases add Conversations and
// Customize by adding an entry here and its page under
// app/dashboard/projects/[id]/<segment>/.

export type ProjectTab = {
  label: string;
  /** The route segment under /dashboard/projects/[id]. */
  segment: string;
};

const KNOWLEDGE_TAB: ProjectTab = { label: "Knowledge", segment: "knowledge" };
const INSTALL_TAB: ProjectTab = { label: "Install", segment: "install" };

export const PROJECT_TABS: readonly ProjectTab[] = [KNOWLEDGE_TAB, INSTALL_TAB];

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
