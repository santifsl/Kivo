import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { BUTTON_BASE_CLASSES, BUTTON_VARIANT_CLASSES } from "../ui/button";
import { cn } from "../ui/cn";

export type LinkButtonVariant = "primary" | "secondary";

/** A link that looks like ui/Button (pill, primary or secondary), for navigation CTAs. */
export function LinkButton({
  variant = "primary",
  arrow = false,
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: LinkButtonVariant;
  /** A trailing ↗ for "go somewhere" CTAs. */
  arrow?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <Link
      data-variant={variant}
      className={cn(
        BUTTON_BASE_CLASSES,
        BUTTON_VARIANT_CLASSES[variant],
        size === "lg" && "h-12 px-6 text-base",
        "motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      {children}
      {arrow ? <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} /> : null}
    </Link>
  );
}
