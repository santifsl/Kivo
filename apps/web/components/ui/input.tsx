import type { ComponentPropsWithRef } from "react";
import { cn } from "./cn";

/** Shared by Input and Textarea: rounded, terracotta focus ring, red border when invalid. */
export const FIELD_CLASSES =
  "w-full min-w-0 rounded-md border border-line-strong bg-card px-3 text-sm text-ink placeholder:text-ink-subtle " +
  "transition-colors focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand " +
  "aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn(FIELD_CLASSES, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn(FIELD_CLASSES, "min-h-28 py-2", className)} {...props} />;
}
