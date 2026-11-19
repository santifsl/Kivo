import type { Plan } from "@kivo/shared";
import { getOwnerPlan } from "../../lib/accounts/get-owner-plan";
import { cn } from "../ui/cn";

const PLAN_LABELS: Record<Plan, string> = { free: "Free", pro: "Pro" };

export function PlanBadgeView({ plan }: { plan: Plan }) {
  return (
    <span
      data-plan={plan}
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
        plan === "pro" ? "border-transparent bg-accent text-accent-ink" : "border-line bg-wash text-ink-muted",
      )}
    >
      {PLAN_LABELS[plan]}
    </span>
  );
}

/** The owner's plan in the top bar. Shows nothing if it can't be read (logged on the server). */
export async function PlanBadge({ loadPlan = getOwnerPlan }: { loadPlan?: () => Promise<Plan | null> }) {
  const plan = await loadPlan();
  return plan ? <PlanBadgeView plan={plan} /> : null;
}
