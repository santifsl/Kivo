import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@kivo/shared";
import { DemoChat } from "../components/landing/demo-chat";
import { Footer } from "../components/landing/footer";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { InstallSnippet } from "../components/landing/install-snippet";
import { Pricing } from "../components/landing/pricing";
import { RevealFallback } from "../components/landing/reveal";
import { SIGN_IN_PATH } from "../lib/auth/routes";

export const metadata: Metadata = {
  title: `${APP_NAME}: AI support chat for any website`,
  description: `${APP_NAME} adds an AI support chat to your website that answers visitors from your own docs. Paste one script tag. Free to start.`,
};

export default function Home() {
  return (
    <div className="theme-dark bg-glow min-h-dvh overflow-x-clip text-ink">
      <RevealFallback />
      <div className="mx-auto flex max-w-5xl flex-col gap-28 px-4 sm:px-6">
        <header className="flex items-center justify-between pt-6">
          <p className="text-lg font-semibold tracking-tight">{APP_NAME}</p>
          <Link
            href={SIGN_IN_PATH}
            className="rounded-sm text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-reduce:transition-none"
          >
            Sign in
          </Link>
        </header>
        <main className="flex flex-col gap-28">
          <Hero />
          <HowItWorks />
          <DemoChat />
          <Pricing />
          <InstallSnippet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
