export type NavItem = { label: string; href: string };

export const DASHBOARD_NAV: readonly NavItem[] = [
  { label: "Projects", href: "/dashboard" },
  { label: "Billing", href: "/dashboard/billing" },
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
