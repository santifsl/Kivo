import { idParamsSchema } from "@kivo/shared";
import {
  getActiveTab,
  PROJECT_TABS,
  type ProjectTabIcon,
  projectTabHref,
} from "../projects/project-tabs";

export type NavIcon = ProjectTabIcon | "projects" | "billing";
export type NavItem = { label: string; href: string; icon: NavIcon };

/** A project the owner can switch to (from the owner's list, RLS-scoped). */
export type SwitcherProject = { id: string; name: string };

export const PROJECTS_HREF = "/dashboard";
export const BILLING_HREF = "/dashboard/billing";

export const DASHBOARD_NAV: readonly NavItem[] = [
  { label: "Projects", href: PROJECTS_HREF, icon: "projects" },
  { label: "Billing", href: BILLING_HREF, icon: "billing" },
];

function normalize(path: string): string {
  const trimmed = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function isUnder(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

/**
 * The href of the nav item to mark active for `pathname`: the longest item href that is the path
 * or a parent of it, matched on whole segments. So `/dashboard/billing` → Billing, and any other
 * `/dashboard/...` page (e.g. a project) → Projects. Null when nothing matches.
 */
export function getActiveHref(pathname: string, items: readonly NavItem[] = DASHBOARD_NAV): string | null {
  const path = normalize(pathname);
  let active: string | null = null;
  for (const { href } of items) {
    if (isUnder(path, href) && (active === null || href.length > active.length)) active = href;
  }
  return active;
}

/** The project id in a /dashboard/projects/<id>/… path, if it's a well-formed id. */
export function projectIdFromPath(pathname: string): string | null {
  const id = /^\/dashboard\/projects\/([^/]+)/.exec(normalize(pathname))?.[1];
  if (!id) return null;
  const parsed = idParamsSchema.safeParse({ id: decodeURIComponent(id) });
  return parsed.success ? parsed.data.id : null;
}

export type NavContext =
  | { kind: "account"; items: readonly NavItem[]; activeHref: string | null }
  | {
      kind: "project";
      project: SwitcherProject;
      items: readonly NavItem[];
      activeHref: string | null;
    };

/**
 * What the sidebar shows for `pathname`. Inside one of the owner's projects: "← All projects"
 * and that project's sections. Anywhere else (including an id that isn't in the owner's list,
 * which renders not-found): Projects and Billing.
 */
export function getNavContext(pathname: string, projects: readonly SwitcherProject[]): NavContext {
  const id = projectIdFromPath(pathname);
  const project = id ? projects.find((p) => p.id === id) : undefined;
  if (!project) {
    return { kind: "account", items: DASHBOARD_NAV, activeHref: getActiveHref(pathname) };
  }
  const items = PROJECT_TABS.map((tab) => ({
    label: tab.label,
    href: projectTabHref(project.id, tab),
    icon: tab.icon,
  }));
  const tab = getActiveTab(normalize(pathname), project.id);
  return {
    kind: "project",
    project,
    items,
    activeHref: tab ? projectTabHref(project.id, tab) : null,
  };
}
