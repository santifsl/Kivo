import { GlassPanel } from "../ui/glass-panel";
import { Reveal } from "./reveal";
import { Section } from "./section";

const STEPS = [
  {
    title: "Add your info",
    body: "Upload your docs as PDF, Markdown or text, or paste them in. That's what the bot answers from.",
  },
  {
    title: "Paste one script tag",
    body: "Copy one line into your site's HTML. The chat button appears in the corner.",
  },
  {
    title: "Visitors get answers",
    body: "People ask in their own words and get answers from your docs right away, day or night.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" eyebrow="How it works" title="Live in three steps">
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={index * 100} className="h-full">
              <GlassPanel className="flex h-full flex-col gap-3 p-6">
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-md border border-line bg-wash text-sm font-semibold text-ink"
                >
                  {index + 1}
                </span>
                <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
                <p className="text-sm text-ink-muted">{step.body}</p>
              </GlassPanel>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
