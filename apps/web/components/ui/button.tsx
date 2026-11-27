import { ArrowUpRight } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  /** Shows a spinner and blocks clicks while an action runs. */
  loading?: boolean;
  /** A trailing ↗ arrow, for "go somewhere" actions. */
  arrow?: boolean;
};

/**
 * Primary: solid pill, ink on paper (light) or paper on ink (dark). Never terracotta.
 * Secondary: outline pill. Ghost: text only.
 */
export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-accent text-accent-ink shadow-sm enabled:hover:bg-accent-hover",
  secondary: "rounded-full border border-line-strong bg-transparent text-ink enabled:hover:bg-wash",
  ghost: "rounded-full text-ink enabled:hover:bg-wash",
};

/** Shared by Button and link-styled buttons. Disabled keeps its shape: 40% opacity, not-allowed cursor. */
export const BUTTON_BASE_CLASSES =
  "inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function Button({
  variant = "primary",
  loading = false,
  arrow = false,
  disabled,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={cn(BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES[variant], className)}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          data-testid="button-spinner"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
      {arrow ? (
        <ArrowUpRight
          aria-hidden="true"
          data-testid="button-arrow"
          className="size-4"
          strokeWidth={1.75}
        />
      ) : null}
    </button>
  );
}
