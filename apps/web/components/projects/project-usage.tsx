import type { Plan, Project } from "@kivo/shared";
import { formatCount, monthlyUsage } from "./usage";

/** "Messages used this month: 38 / 100" on project pages. */
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
  const { used, limit } = monthlyUsage(project, plan, now);
  return (
    <p className="text-sm text-ink-muted">
      Messages used this month:{" "}
      <span className="font-medium text-ink tabular-nums">
        {formatCount(used)} / {formatCount(limit)}
      </span>
    </p>
  );
}
