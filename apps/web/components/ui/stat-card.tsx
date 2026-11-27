import type { ReactNode } from "react";
import { Card } from "./card";
import { cn } from "./cn";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  /**
   * Small text under the number, e.g. "of 100 this month". May hold block content (a usage bar):
   * it renders in a <div>, since a <div> inside a <p> is invalid HTML and breaks hydration.
   */
  sub?: ReactNode;
  className?: string;
};

export function StatCard({ label, value, sub, className }: StatCardProps) {
  return (
    <Card className={cn("flex flex-col gap-2 p-5", className)}>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="font-display text-4xl leading-display tracking-display text-ink">{value}</p>
      {sub ? <div className="text-xs text-ink-subtle">{sub}</div> : null}
    </Card>
  );
}
