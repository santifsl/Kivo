import { APP_NAME } from "@kivo/shared";
import { SIGN_UP_PATH } from "../../lib/auth/routes";
import { LinkButton } from "./link-button";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="flex flex-col items-center gap-8 pt-16 text-center sm:pt-24">
      <Reveal>
        <p className="rounded-lg border border-line bg-glass px-3 py-1 text-xs text-ink-muted backdrop-blur-glass">
          AI support chat for any website
        </p>
      </Reveal>
      <Reveal delay={100} className="flex flex-col items-center gap-5">
        <h1 id="hero-title" className="text-5xl font-semibold tracking-tight text-ink sm:text-7xl">
          {APP_NAME}
        </h1>
        <p className="max-w-xl text-lg text-ink-muted sm:text-xl">
          Answer every visitor in seconds. {APP_NAME} adds an AI support chat to any website, and it
          answers from your own docs.
        </p>
      </Reveal>
      <Reveal delay={200} className="flex flex-wrap justify-center gap-3">
        <LinkButton href={SIGN_UP_PATH}>Start free</LinkButton>
        <LinkButton href="#how-it-works" variant="secondary">
          See how it works
        </LinkButton>
      </Reveal>
    </section>
  );
}
