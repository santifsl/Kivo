import { PLAN_LIMITS, type Plan, type Project } from "@kivo/shared";
import { formatProjectDate } from "./format-date";

export interface MonthlyUsage {
  used: number;
  limit: number;
  /** 0–1, for the usage bar. */
  ratio: number;
  /** "Dec 1, 2026": the first day of next UTC month, when the count resets. */
  resetsOn: string;
}

/**
 * A project's message usage this UTC month. Matches consume_message: a
 * period that started before this UTC month has rolled over, so it counts 0.
 */
export function monthlyUsage(
  project: Pick<Project, "messages_used" | "period_start">,
  plan: Plan,
  now: Date = new Date(),
): MonthlyUsage {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1);
  const used = Date.parse(project.period_start) < monthStart ? 0 : project.messages_used;
  const limit = PLAN_LIMITS[plan].messagesPerMonth;
  return {
    used,
    limit,
    ratio: limit > 0 ? Math.min(1, used / limit) : 0,
    resetsOn: formatProjectDate(new Date(Date.UTC(year, month + 1, 1)).toISOString()),
  };
}

const number = new Intl.NumberFormat("en-US");
export const formatCount = (n: number) => number.format(n);
