import type { ReactNode } from "react";
import { GlassPanel } from "../ui/glass-panel";
import { MobileNav } from "./mobile-nav";
import { Sidebar, type SidebarProps } from "./sidebar";

/**
 * The dashboard frame: a sidebar on desktop, a top bar with a sheet below `md`.
 * No top bar on desktop (audit #3): the plan lives in the switcher card.
 */
export function DashboardShell({
  projects,
  plan,
  children,
}: Omit<SidebarProps, "onNavigate"> & { children: ReactNode }) {
  return (
    <div className="bg-glow min-h-dvh text-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pb-6 md:flex-row md:gap-8 md:p-6">
        <MobileNav projects={projects} plan={plan} />
        <aside className="sticky top-6 hidden h-[calc(100dvh-3rem)] w-64 shrink-0 md:block">
          <GlassPanel className="flex h-full flex-col p-4">
            <Sidebar projects={projects} plan={plan} />
          </GlassPanel>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-6 md:pt-2">{children}</main>
      </div>
    </div>
  );
}
