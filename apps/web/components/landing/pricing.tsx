import type { Plan } from "@kivo/shared";
import { SIGN_UP_PATH } from "../../lib/auth/routes";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";
import styles from "./landing.module.css";
import { LinkButton } from "./link-button";
import { formatMonthlyPrice, getPricingRows } from "./pricing-data";
import { Reveal } from "./reveal";
import { Section } from "./section";

export const PRO_BADGE = "Recommended";

const PLAN_CARDS: ReadonlyArray<{ plan: Plan; name: string; blurb: string; cta: string }> = [
  {
    plan: "free",
    name: "Free",
    blurb: "Everything you need to try it on one site.",
    cta: "Start free",
  },
  {
    plan: "pro",
    name: "Pro",
    blurb: "More sites, more messages, and your own look.",
    cta: "Start free, upgrade anytime",
  },
];

export function Pricing() {
  const rows = getPricingRows();
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Simple pricing."
      accent="Start free."
      description="Upgrade when you need more sites, more messages or your own look."
    >
      <div
        aria-hidden="true"
        className={cn(styles.glow, "absolute top-1/3 left-1/2 -z-10 size-[48rem] -translate-x-1/2")}
      />
      <div className="grid gap-5 md:grid-cols-2">
        {PLAN_CARDS.map((card, index) => {
          const pro = card.plan === "pro";
          return (
            <Reveal key={card.plan} delay={index * 100} className="h-full">
              <Card
                as="section"
                aria-labelledby={`plan-${card.plan}`}
                data-plan={card.plan}
                className={cn(
                  "relative flex h-full flex-col gap-7 p-6 sm:p-8",
                  pro && "shadow-glass-lg outline -outline-offset-1 outline-brand",
                )}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 id={`plan-${card.plan}`} className="text-lg font-medium text-ink">
                      {card.name}
                    </h3>
                    {pro ? <Badge data-testid="pro-badge">{PRO_BADGE}</Badge> : null}
                  </div>
                  <p className="flex items-baseline gap-1.5">
                    <span className="font-display text-6xl leading-none text-ink">
                      {formatMonthlyPrice(card.plan)}
                    </span>
                    <span className="text-sm text-ink-muted">/month</span>
                  </p>
                  <p className="text-sm text-ink-muted">{card.blurb}</p>
                </div>
                <dl className="flex flex-col divide-y divide-line border-y border-line text-sm">
                  {rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-4 py-2.5"
                    >
                      <dt className="text-ink-muted">{row.label}</dt>
                      <dd className="text-right font-medium text-ink">{row[card.plan]}</dd>
                    </div>
                  ))}
                </dl>
                <LinkButton
                  href={SIGN_UP_PATH}
                  variant={pro ? "primary" : "secondary"}
                  size="lg"
                  className="mt-auto"
                >
                  {card.cta}
                </LinkButton>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
