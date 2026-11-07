import type { Plan, WidgetAnimation } from "./enums";

export interface PlanLimits {
  /** Max projects per account. */
  projects: number;
  /** Max accepted visitor messages per project per month. */
  messagesPerMonth: number;
  /** Max knowledge sources per project (files + pasted text). */
  knowledgeSources: number;
  /** May set any button color. */
  customColor: boolean;
  /** May place the button in any corner. */
  anyPosition: boolean;
  /** May set a custom button label. */
  customLabel: boolean;
  /** Open animations the plan may use. */
  animations: readonly WidgetAnimation[];
  /** May set a custom header text. */
  customHeader: boolean;
  /** May hide the "Powered by" badge. */
  hideBadge: boolean;
}

/** Plan limits, docs/project.md §5. The only place they live. */
export const PLAN_LIMITS = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    customColor: false,
    anyPosition: false,
    customLabel: false,
    animations: ["fade"],
    customHeader: false,
    hideBadge: false,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    customColor: true,
    anyPosition: true,
    customLabel: true,
    animations: ["fade", "slide", "scale"],
    customHeader: true,
    hideBadge: true,
  },
} as const satisfies Record<Plan, PlanLimits>;

/** Price per plan, USD per month. The landing page reads it. */
export const PLAN_PRICES = {
  free: 0,
  pro: 9,
} as const satisfies Record<Plan, number>;
