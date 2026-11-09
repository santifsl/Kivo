"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { DASHBOARD_NAV, getActiveHref } from "./nav";
import { NavLinks } from "./nav-links";

const MENU_ID = "dashboard-mobile-menu";

/** Below `md`, the sidebar collapses into this top menu. */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((value) => !value)}
        className="px-3"
      >
        {open ? "Close" : "Menu"}
      </Button>
      {open ? (
        <GlassPanel
          as="nav"
          surface="raised"
          id={MENU_ID}
          aria-label="Dashboard"
          className="absolute inset-x-0 top-full mt-2 p-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          <NavLinks items={DASHBOARD_NAV} activeHref={getActiveHref(pathname)} onNavigate={() => setOpen(false)} />
        </GlassPanel>
      ) : null}
    </div>
  );
}
