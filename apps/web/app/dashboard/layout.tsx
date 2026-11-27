import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { ensureAccount } from "@/lib/accounts/ensure-account";
import { getOwnerPlan } from "@/lib/accounts/get-owner-plan";
import { PosthogClerkOwner } from "@/lib/posthog/clerk-owner";
import { AppClerkProvider } from "@/components/auth/app-clerk-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadOwnerProjects } from "@/components/projects/load-owner-projects";

// The dashboard frame (components/dashboard/dashboard-shell.tsx). Pages still
// call auth.protect() themselves (layouts don't re-run on navigation).
export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  // userId comes from the Clerk session on the server, never from the request.
  const { userId } = await auth.protect();
  // First sign-in creates the `accounts` row (plan `free`); later calls do nothing.
  await ensureAccount(userId);

  // The switcher's list and the plan, with the owner client (RLS). If either
  // read fails, the frame still renders: the page shows its own error state.
  const [projects, plan] = await Promise.all([
    loadOwnerProjects().catch((err: unknown) => {
      console.error("[dashboard layout] projects", err instanceof Error ? err.message : err);
      return [];
    }),
    getOwnerPlan(),
  ]);

  return (
    <AppClerkProvider>
      <PosthogClerkOwner />
      <DashboardShell projects={projects.map(({ id, name }) => ({ id, name }))} plan={plan}>
        {children}
      </DashboardShell>
    </AppClerkProvider>
  );
}
