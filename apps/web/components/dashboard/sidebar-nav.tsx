"use client";

import { usePathname } from "next/navigation";
import { DASHBOARD_NAV, getActiveHref } from "./nav";
import { NavLinks } from "./nav-links";

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard">
      <NavLinks items={DASHBOARD_NAV} activeHref={getActiveHref(pathname)} />
    </nav>
  );
}
