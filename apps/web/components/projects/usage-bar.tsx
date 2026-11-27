import { cn } from "../ui/cn";

/** A thin terracotta bar for usage (0–1). Decorative: the numbers are always shown as text too. */
export function UsageBar({ ratio, className }: { ratio: number; className?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div aria-hidden="true" className={cn("h-1.5 overflow-hidden rounded-full bg-wash-strong", className)}>
      <div data-testid="usage-bar-fill" className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </div>
  );
}
