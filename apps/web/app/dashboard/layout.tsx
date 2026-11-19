import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@kivo/shared";
import { ensureAccount } from "@/lib/accounts/ensure-account";
import { AppClerkProvider } from "@/components/auth/app-clerk-provider";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { GlassPanel } from "@/components/ui/glass-panel";

// Light glass shell. Pages still call auth.protect() themselves (layouts don't re-run on navigation).
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  // userId comes from the Clerk session on the server, never from the request.
  const { userId } = await auth.protect();
  // First sign-in creates the `accounts` row (plan `free`); later calls do nothing.
  await ensureAccount(userId);

  return (
    <AppClerkProvider>
      <div className="bg-glow min-h-dvh text-ink">
        <div className="mx-auto flex max-w-7xl gap-4 p-4 md:gap-6 md:p-6">
          <aside className="sticky top-6 hidden h-[calc(100dvh-3rem)] w-60 shrink-0 md:block">
            <GlassPanel className="flex h-full flex-col gap-6 p-4">
              <p className="px-3 text-lg font-semibold tracking-tight">{APP_NAME}</p>
              <SidebarNav />
            </GlassPanel>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <GlassPanel
              as="header"
              className="sticky top-4 z-10 flex h-14 items-center justify-between gap-2 px-3 md:top-6 md:px-4"
            >
              <div className="flex min-w-0 items-center gap-1">
                <MobileNav />
                <p className="truncate px-2 font-semibold tracking-tight md:hidden">{APP_NAME}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <PlanBadge />
                <UserButton />
              </div>
            </GlassPanel>
            <main className="flex min-w-0 flex-col gap-6">{children}</main>
          </div>
        </div>
      </div>
    </AppClerkProvider>
  );
}
