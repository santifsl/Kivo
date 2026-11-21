import { PLAN_LIMITS, type Plan, type Project } from "@kivo/shared";

const number = new Intl.NumberFormat("en-US");

export function ProjectUsage({
  project,
  plan,
  now = new Date(),
}: {
  project: Pick<Project, "messages_used" | "period_start">;
  plan: Plan | null;
  now?: Date;
}) {
  if (!plan) return <p className="text-sm text-ink-muted">Message usage unavailable</p>;

  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  // Match consume_message: only a period before this UTC month has rolled over.
  const used = Date.parse(project.period_start) < monthStart ? 0 : project.messages_used;
  const limit = PLAN_LIMITS[plan].messagesPerMonth;

  return (
    <p className="text-sm text-ink-muted">
      Messages used this month:{" "}
      <span className="font-medium text-ink tabular-nums">
        {number.format(used)} / {number.format(limit)}
      </span>
    </p>
  );
}
