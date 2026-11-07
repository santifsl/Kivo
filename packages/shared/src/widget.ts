import { z } from "zod";
import { type Plan, widgetAnimationSchema, widgetPositionSchema } from "./enums";
import { PLAN_LIMITS } from "./plans";

/** `#rrggbb` hex color. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #1a2b3c");

export const WIDGET_LABEL_MAX_LENGTH = 30;
export const WIDGET_HEADER_MAX_LENGTH = 80;

/** Widget config, matching the `widget_configs` columns (docs/project.md §7). */
export const widgetConfigSchema = z.strictObject({
  button_color: hexColorSchema,
  position: widgetPositionSchema,
  label: z.string().trim().min(1).max(WIDGET_LABEL_MAX_LENGTH),
  animation: widgetAnimationSchema,
  header_text: z.string().trim().min(1).max(WIDGET_HEADER_MAX_LENGTH),
  show_badge: z.boolean(),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export const DEFAULT_WIDGET_CONFIG = {
  button_color: "#000000",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
  header_text: "How can we help?",
  show_badge: true,
} as const satisfies WidgetConfig;

/**
 * The config the plan allows. Each field the plan can't customize falls back
 * to the default; the badge stays on unless the plan may hide it.
 * Free gets the defaults with the badge; Pro gets the saved config.
 */
export function applyPlanToConfig(config: WidgetConfig, plan: Plan): WidgetConfig {
  const limits = PLAN_LIMITS[plan];
  const d = DEFAULT_WIDGET_CONFIG;
  const allowedAnimations: readonly string[] = limits.animations;
  return {
    button_color: limits.customColor ? config.button_color : d.button_color,
    position: limits.anyPosition ? config.position : d.position,
    label: limits.customLabel ? config.label : d.label,
    animation: allowedAnimations.includes(config.animation) ? config.animation : d.animation,
    header_text: limits.customHeader ? config.header_text : d.header_text,
    show_badge: limits.hideBadge ? config.show_badge : true,
  };
}
