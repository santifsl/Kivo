import { PLAN_LIMITS, PLAN_PRICES, type Plan } from "@kivo/shared";

const PLAN_NAMES: Record<Plan, string> = { free: "Free", pro: "Pro" };
const count = new Intl.NumberFormat("en-US");
const plural = (n: number, word: string) => `${count.format(n)} ${word}${n === 1 ? "" : "s"}`;

/** The current-plan card's text, from PLAN_LIMITS and PLAN_PRICES (packages/shared). */
export function describePlan(plan: Plan): { name: string; price: string; included: string[] } {
  const limits = PLAN_LIMITS[plan];
  return {
    name: `${PLAN_NAMES[plan]} plan`,
    price: PLAN_PRICES[plan] === 0 ? "$0" : `$${PLAN_PRICES[plan]} / month`,
    included: [
      plural(limits.projects, "project"),
      `${plural(limits.messagesPerMonth, "message")} per project each month`,
      `${plural(limits.knowledgeSources, "knowledge source")} per project`,
      limits.customColor ? "Full widget customization" : "The default widget look",
    ],
  };
}
