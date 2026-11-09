import type { Plan } from "@kivo/shared";
import { SIGN_UP_PATH } from "../../lib/auth/routes";
import { GlassPanel } from "../ui/glass-panel";
import { LinkButton } from "./link-button";
import { formatMonthlyPrice, getPricingRows } from "./pricing-data";
import { Reveal } from "./reveal";
import { Section } from "./section";

const PLAN_CARDS: ReadonlyArray<{ plan: Plan; name: string; blurb: string; cta: string }> = [
  { plan: "free", name: "Free", blurb: "Everything you need to try it on one site.", cta: "Start free" },
  { plan: "pro", name: "Pro", blurb: "More sites, more messages, and your own look.", cta: "Start free, upgrade anytime" },
];

export function Pricing() {
  const rows = getPricingRows();
  return (
    <Section id="pricing" eyebrow="Pricing" title="Simple pricing" description="Start free. Upgrade when you need more.">
      <div className="grid gap-4 md:grid-cols-2">
        {PLAN_CARDS.map((card, index) => (
          <Reveal key={card.plan} delay={index * 100} className="h-full">
            <GlassPanel
              as="section"
              surface={card.plan === "pro" ? "raised" : "default"}
              aria-labelledby={`plan-${card.plan}`}
              data-plan={card.plan}
              className="flex h-full flex-col gap-6 p-6 sm:p-8"
            >
              <div className="flex flex-col gap-2">
                <h3 id={`plan-${card.plan}`} className="text-lg font-semibold text-ink">
                  {card.name}
                </h3>
                <p className="flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-ink">{formatMonthlyPrice(card.plan)}</span>
                  <span className="text-sm text-ink-muted">/month</span>
                </p>
                <p className="text-sm text-ink-muted">{card.blurb}</p>
              </div>
              <dl className="flex flex-col divide-y divide-line text-sm">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-ink-muted">{row.label}</dt>
                    <dd className="text-right font-medium text-ink">{row[card.plan]}</dd>
                  </div>
                ))}
              </dl>
              <LinkButton
                href={SIGN_UP_PATH}
                variant={card.plan === "pro" ? "primary" : "secondary"}
                className="mt-auto"
              >
                {card.cta}
              </LinkButton>
            </GlassPanel>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
