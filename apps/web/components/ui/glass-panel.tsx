import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn";

type GlassElement = "div" | "section" | "aside" | "nav" | "header";

/** "default": translucent panel. "raised": near-opaque with a deeper shadow, for menus over content. */
export type GlassSurface = "default" | "raised";

export type GlassPanelProps<T extends GlassElement = "div"> = {
  as?: T;
  surface?: GlassSurface;
} & ComponentPropsWithoutRef<T>;

const SURFACE_CLASSES: Record<GlassSurface, string> = {
  default: "bg-glass shadow-glass",
  raised: "bg-glass-strong shadow-glass-lg",
};

/** Translucent, blurred surface. Every panel in the app is one of these. */
export function GlassPanel<T extends GlassElement = "div">({
  as,
  surface = "default",
  className,
  ...props
}: GlassPanelProps<T>) {
  const Element: GlassElement = as ?? "div";
  return (
    <Element
      data-surface={surface}
      className={cn("rounded-lg border border-line backdrop-blur-glass", SURFACE_CLASSES[surface], className)}
      {...props}
    />
  );
}
