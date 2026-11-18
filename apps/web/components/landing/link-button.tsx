import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "../ui/cn";

export type LinkButtonVariant = "primary" | "secondary";

const VARIANT_CLASSES: Record<LinkButtonVariant, string> = {
  primary: "bg-accent text-accent-ink shadow-sm hover:bg-accent-hover",
  secondary: "border border-line bg-wash text-ink hover:bg-wash-strong",
};

/** A link that looks like ui/Button, for navigation CTAs (a <button> can't be a link). */
export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: LinkButtonVariant }) {
  return (
    <Link
      data-variant={variant}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition-colors motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
