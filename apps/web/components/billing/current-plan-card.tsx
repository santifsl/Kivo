import type { Plan } from "@kivo/shared";
import { Check } from "lucide-react";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { PlanAction } from "./billing-controls";
import { describePlan } from "./current-plan";

/** The owner's plan (read on the server), what it includes, and Clerk's subscription management. */
export function CurrentPlanCard({ plan }: { plan: Plan | null }) {
  const details = plan ? describePlan(plan) : null;
  return (
    <Card as="section" aria-labelledby="current-plan-heading" className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-ink-muted">Current plan</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="current-plan-heading"
              className="font-display text-3xl leading-display tracking-display text-ink"
            >
              {details ? details.name : "Plan unavailable"}
            </h2>
            {details ? <Badge variant="success">Active</Badge> : null}
          </div>
          <p className="text-sm text-ink-muted">
            {details ? details.price : "We couldn't read your plan. Refresh the page to try again."}
          </p>
        </div>
        <PlanAction plan={plan} />
      </div>
      {details ? (
        <ul aria-label="Included" className="grid gap-2 text-sm text-ink sm:grid-cols-2">
          {details.included.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={2} />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
