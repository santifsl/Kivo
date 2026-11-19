import { PLAN_LIMITS, type Plan } from "@kivo/shared";

// The project limit as the dashboard shows it. The numbers come from
// PLAN_LIMITS (packages/shared). This is only a hint: the server decides
// (POST /api/projects answers 403 plan_limit).

const plural = (n: number) => `${n} ${n === 1 ? "project" : "projects"}`;

/** True when `count` projects already fill `plan`'s limit. */
export function isAtProjectLimit(plan: Plan, count: number): boolean {
  return count >= PLAN_LIMITS[plan].projects;
}

/** "Free includes 1 project. Pro includes 5." on Free; the Pro limit on Pro. */
export function projectLimitMessage(plan: Plan): string {
  if (plan === "pro") return `Pro includes ${plural(PLAN_LIMITS.pro.projects)}. Delete one to add another.`;
  return `Free includes ${plural(PLAN_LIMITS.free.projects)}. Pro includes ${PLAN_LIMITS.pro.projects}.`;
}

export const BILLING_HREF = "/dashboard/billing";
