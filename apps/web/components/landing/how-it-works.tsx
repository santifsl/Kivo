import { ArrowRight, CodeXml, FileText, MessagesSquare } from "lucide-react";
import { Card } from "../ui/card";
import { Reveal } from "./reveal";
import { Section } from "./section";

export const STEPS = [
  {
    icon: FileText,
    title: "Add your knowledge",
    body: "Upload PDF, Markdown or text files, or paste text in. That's all the bot answers from.",
  },
  {
    icon: CodeXml,
    title: "Install the widget",
    body: "Copy one script tag into your site's HTML. The chat button appears in the corner.",
  },
  {
    icon: MessagesSquare,
    title: "Answer instantly",
    body: "Visitors ask in their own words and get answers from your docs in seconds, 24/7.",
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" eyebrow="How it works" title="Live in three" accent="steps.">
      <ol className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch md:gap-3">
        {STEPS.flatMap(({ icon: Icon, title, body }, index) => [
          <li key={title} className="contents">
            <Reveal delay={index * 100} className="h-full">
              <Card className="flex h-full flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden="true"
                    className="flex size-11 items-center justify-center rounded-md border border-line bg-wash text-ink"
                  >
                    <Icon className="size-5" strokeWidth={1.5} />
                  </span>
                  <span className="font-display text-2xl text-ink-subtle">
                    <span className="sr-only">Step </span>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="text-lg font-medium text-ink">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
              </Card>
            </Reveal>
          </li>,
          index < STEPS.length - 1 ? (
            <li
              key={`${title}-arrow`}
              aria-hidden="true"
              className="hidden items-center text-ink-subtle md:flex"
            >
              <ArrowRight className="size-5" strokeWidth={1.5} />
            </li>
          ) : null,
        ])}
      </ol>
    </Section>
  );
}
