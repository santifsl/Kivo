import { BookOpenCheck, CircleHelp, CodeXml, Play } from "lucide-react";
import { APP_NAME } from "@kivo/shared";
import { SIGN_UP_PATH } from "../../lib/auth/routes";
import { HeroArt } from "../brand/hero-art";
import { cn } from "../ui/cn";
import { Eyebrow } from "../ui/eyebrow";
import { ChatCardMock } from "./chat-card-mock";
import styles from "./landing.module.css";
import { LinkButton } from "./link-button";
import { Enter } from "./reveal";

/** Only claims the product backs today (docs/project.md §6.5, §6.6). */
export const TRUST_POINTS = [
  { icon: BookOpenCheck, label: "Answers only from your docs" },
  { icon: CodeXml, label: "One script tag to install" },
  { icon: CircleHelp, label: "Says “I don't know” instead of guessing" },
] as const;

export const HERO_SUBTEXT = `${APP_NAME} is an AI support agent that answers only from the documents you give it, so visitors get accurate answers and your team gets fewer tickets.`;

/** `hasDemo`: the live demo section is on the page, so "See it in action" has somewhere to go. */
export function Hero({ hasDemo }: { hasDemo: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <HeroArt className="-z-10" />
      {/* Narrow screens: keep the copy legible over the ridge. */}
      <div
        aria-hidden="true"
        className={cn(styles.heroScrim, "absolute inset-0 -z-10 lg:hidden")}
      />
      <div
        aria-hidden="true"
        className={cn(styles.heroFade, "absolute inset-x-0 bottom-0 -z-10 h-40")}
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-24 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:pt-28 lg:pb-36">
        <div className="flex flex-col gap-8">
          <Enter>
            <Eyebrow>AI support grounded in your docs</Eyebrow>
          </Enter>
          <Enter delay={80}>
            <h1
              id="hero-title"
              className="font-display text-5xl leading-display tracking-display text-ink sm:text-6xl lg:text-7xl"
            >
              Support that answers from your docs.{" "}
              <em className="block text-brand">Nothing else.</em>
            </h1>
          </Enter>
          <Enter delay={160}>
            <p className="max-w-xl text-lg text-ink-muted">{HERO_SUBTEXT}</p>
          </Enter>
          <Enter delay={240} className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <LinkButton href={SIGN_UP_PATH} size="lg" arrow>
              Get started free
            </LinkButton>
            {hasDemo ? (
              <a
                href="#demo"
                className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-ink hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                See it in action
                <Play aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              </a>
            ) : null}
          </Enter>
          <Enter delay={320}>
            <ul className="flex flex-col gap-3 border-t border-line pt-6 text-sm text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-brand"
                    strokeWidth={1.5}
                  />
                  {label}
                </li>
              ))}
            </ul>
          </Enter>
        </div>

        <Enter delay={200} className="flex justify-center lg:justify-end">
          <ChatCardMock />
        </Enter>
      </div>
    </section>
  );
}
