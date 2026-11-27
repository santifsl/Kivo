import { ArrowDownRight } from "lucide-react";
import { APP_NAME } from "@kivo/shared";
import { Card } from "../ui/card";
import { LandingWidget } from "./landing-widget";
import { OpenChatButton } from "./open-chat-button";
import { Reveal } from "./reveal";
import { Section } from "./section";

/** Questions the landing project's own knowledge (about the app itself) can answer. */
export const DEMO_QUESTIONS = [
  `How do I install ${APP_NAME} on my website?`,
  "What file types can I upload?",
  "What does the Pro plan include?",
] as const;

export function LiveDemo({ widgetKey }: { widgetKey: string }) {
  return (
    <Section
      id="demo"
      eyebrow="Live demo"
      title="Ask it"
      accent="yourself."
      description={`The chat in the bottom-right corner is ${APP_NAME} itself, answering from ${APP_NAME}'s own docs.`}
    >
      <Reveal>
        <Card className="grid gap-10 p-8 sm:p-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-medium text-ink">Try one of these:</p>
            <ul className="flex flex-col gap-3">
              {DEMO_QUESTIONS.map((question) => (
                <li
                  key={question}
                  className="rounded-lg border border-line bg-wash px-4 py-3 font-display text-xl text-ink italic sm:text-2xl"
                >
                  “{question}”
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <OpenChatButton />
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              or use the button in the corner
              <ArrowDownRight aria-hidden="true" className="size-4 text-brand" strokeWidth={1.75} />
            </p>
          </div>
        </Card>
      </Reveal>
      <LandingWidget widgetKey={widgetKey} />
    </Section>
  );
}
