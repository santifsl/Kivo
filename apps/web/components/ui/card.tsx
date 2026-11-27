import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

type CardElement = "div" | "section" | "article" | "aside";

export type CardProps<T extends CardElement = "div"> = { as?: T } & ComponentPropsWithoutRef<T>;

/** A solid card: 16px radius, 1px line, soft shadow in light, graphite in dark. */
export function Card<T extends CardElement = "div">({ as, className, ...props }: CardProps<T>) {
  const Element: CardElement = as ?? "div";
  return (
    <Element
      className={cn("rounded-lg border border-line bg-card text-ink shadow-card", className)}
      {...props}
    />
  );
}
