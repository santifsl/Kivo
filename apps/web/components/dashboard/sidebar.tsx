"use client";

import { UserButton } from "@clerk/nextjs";
import { ArrowLeft, CreditCard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Plan } from "@kivo/shared";
import { ThemeSwitch } from "../theme/theme-switch";
import { cn } from "../ui/cn";
import { BILLING_HREF, type NavContext, PROJECTS_HREF, type SwitcherProject, getNavContext } from "./nav";
import { NavLinks } from "./nav-links";
import { ProjectSwitcher } from "./project-switcher";
import { ThemedLogo } from "./themed-logo";

export type SidebarProps = {
  projects: readonly SwitcherProject[];
  plan: Plan | null;
  /** Called after any link is followed (the mobile sheet closes itself). */
  onNavigate?: () => void;
};

const SUBTLE_LINK =
  "flex h-9 items-center gap-2 rounded-md px-3 text-sm text-ink-muted transition-colors hover:bg-wash hover:text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** The sidebar's contents for the current page. Used by the desktop sidebar and the mobile sheet. */
export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  return <SidebarView {...props} context={getNavContext(pathname, props.projects)} />;
}

export function SidebarView({
  projects,
  plan,
  onNavigate,
  context,
}: SidebarProps & { context: NavContext }) {
  const inProject = context.kind === "project";
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <Link
        href={PROJECTS_HREF}
        onClick={onNavigate}
        className="w-fit rounded-md px-3 pt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <ThemedLogo />
      </Link>

      <nav aria-label="Dashboard" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {inProject ? (
          <Link href={PROJECTS_HREF} onClick={onNavigate} className={SUBTLE_LINK}>
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
            All projects
          </Link>
        ) : null}
        <NavLinks items={context.items} activeHref={context.activeHref} onNavigate={onNavigate} />
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <ProjectSwitcher
          current={inProject ? context.project : null}
          projects={projects}
          plan={plan}
          onNavigate={onNavigate}
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <UserButton />
          <ThemeSwitch />
        </div>
        {inProject ? (
          <Link href={BILLING_HREF} onClick={onNavigate} className={cn(SUBTLE_LINK, "w-full")}>
            <CreditCard aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Billing
          </Link>
        ) : null}
      </div>
    </div>
  );
}
