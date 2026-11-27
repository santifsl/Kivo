import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

export type BadgeVariant = "neutral" | "success";

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: BadgeVariant;
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-line bg-wash text-ink-muted",
  success: "border-transparent bg-success-soft text-success",
};

/** A small pill. `success` (e.g. "Active") has a green dot; green is for status only. */
export function Badge({ variant = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {variant === "success" ? (
        <span
          aria-hidden="true"
          data-testid="badge-dot"
          className="size-1.5 rounded-full bg-success"
        />
      ) : null}
      {children}
    </span>
  );
}
