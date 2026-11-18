import {
  DEFAULT_WIDGET_CONFIG,
  PLAN_LIMITS,
  PLAN_PRICES,
  type Plan,
  type PlanLimits,
  type WidgetPosition,
} from "@kivo/shared";

/** One row of the pricing comparison: docs/project.md §5, in the same order. */
export type PricingRow = { label: string; free: string; pro: string };

const number = new Intl.NumberFormat("en-US");

const POSITION_LABELS: Record<WidgetPosition, string> = {
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
  "top-right": "Top right",
  "top-left": "Top left",
};

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** How each §5 row reads a plan's limits. Every value comes from PlanLimits. */
const ROWS: ReadonlyArray<{ label: string; value: (limits: PlanLimits) => string }> = [
  { label: "Projects", value: (l) => number.format(l.projects) },
  { label: "Messages / month (per project)", value: (l) => number.format(l.messagesPerMonth) },
  { label: "Knowledge sources (per project)", value: (l) => number.format(l.knowledgeSources) },
  { label: "Button color", value: (l) => (l.customColor ? "Any" : "Default") },
  {
    label: "Button position",
    value: (l) => (l.anyPosition ? "Any corner" : POSITION_LABELS[DEFAULT_WIDGET_CONFIG.position]),
  },
  { label: "Button label", value: (l) => (l.customLabel ? "Custom" : "Default") },
  { label: "Open animation", value: (l) => l.animations.map(capitalize).join(" / ") },
  { label: "Header text", value: (l) => (l.customHeader ? "Custom" : "Default") },
  { label: "“Powered by” badge", value: (l) => (l.hideBadge ? "Hidden" : "Shown") },
];

export function getPricingRows(limits: Record<Plan, PlanLimits> = PLAN_LIMITS): PricingRow[] {
  return ROWS.map(({ label, value }) => ({ label, free: value(limits.free), pro: value(limits.pro) }));
}

/** "$9" from PLAN_PRICES (USD per month). */
export function formatMonthlyPrice(plan: Plan, prices: Record<Plan, number> = PLAN_PRICES): string {
  return `$${number.format(prices[plan])}`;
}
