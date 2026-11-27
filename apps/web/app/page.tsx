import type { Metadata } from "next";
import { connection } from "next/server";
import { APP_NAME } from "@kivo/shared";
import { Footer } from "../components/landing/footer";
import { GroundedAnswers } from "../components/landing/grounded-answers";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { InstallSnippet } from "../components/landing/install-snippet";
import { LiveDemo } from "../components/landing/live-demo";
import { Pricing } from "../components/landing/pricing";
import { SiteNav } from "../components/landing/site-nav";

export const metadata: Metadata = {
  title: `${APP_NAME}: AI support that answers from your docs`,
  description: `${APP_NAME} is an AI support agent that answers only from the documents you give it. Paste one script tag. Free to start.`,
};

/**
 * The landing page: always dark (project.md §13), whatever the owner's theme. A flat canvas,
 * with the hero art and soft glows each fading out inside their own section, so a tall page has
 * no gradient edge.
 */
export default async function Home() {
  await connection();
  const widgetKey = process.env.LANDING_WIDGET_KEY?.trim();
  const hasDemo = Boolean(widgetKey);

  return (
    <div className="theme-dark min-h-dvh overflow-x-clip bg-canvas font-sans text-ink">
      <SiteNav />
      <main>
        <Hero hasDemo={hasDemo} />
        <div className="mx-auto flex max-w-6xl flex-col gap-32 px-4 pt-8 pb-32 sm:px-6">
          <HowItWorks />
          <GroundedAnswers />
          {widgetKey ? <LiveDemo widgetKey={widgetKey} /> : null}
          <Pricing />
          <InstallSnippet />
        </div>
      </main>
      <Footer hasDemo={hasDemo} />
    </div>
  );
}
