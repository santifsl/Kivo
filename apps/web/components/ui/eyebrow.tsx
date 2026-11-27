import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

/** A 16px terracotta dash, then a small uppercase label. */
export function Eyebrow({ className, children, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs font-medium uppercase tracking-eyebrow text-ink-muted",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" data-testid="eyebrow-dash" className="h-px w-4 shrink-0 bg-brand" />
      {children}
    </p>
  );
}
