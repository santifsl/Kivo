"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { APP_NAME } from "@kivo/shared";
import { ArrowLeft, BookOpenCheck, CodeXml, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense, useSyncExternalStore } from "react";
import { HeroArt } from "../brand/hero-art";
import { KivoLogo } from "../brand/logo";
import { LoadingState } from "../ui/loading-state";
import { type ClerkAppearance, useClerkAppearance } from "./clerk-appearance";

export type AuthMode = "sign-in" | "sign-up";

export const AUTH_COPY: Record<AuthMode, { line: string; title: string }> = {
  "sign-in": { line: "Welcome back.", title: `Sign in to ${APP_NAME}` },
  "sign-up": { line: "Start answering from your docs.", title: `Create your ${APP_NAME} account` },
};

/** Short, true benefit lines for the brand panel. */
export const AUTH_BENEFITS = [
  { icon: BookOpenCheck, label: "Answers only from the docs you add" },
  { icon: CodeXml, label: "One script tag on your site" },
  { icon: Sparkles, label: "Free plan, no card needed" },
] as const;

/**
 * Clerk element styles: our header replaces Clerk's logo and title, and buttons are pills.
 * Style objects, not Tailwind classes: Clerk's injected CSS outranks Tailwind's layered utilities.
 */
const PILL = { borderRadius: "9999px" } as const;
export const CLERK_ELEMENTS = {
  rootBox: { width: "100%" },
  header: { display: "none" },
  logoBox: { display: "none" },
  cardBox: { width: "100%", maxWidth: "none" },
  formButtonPrimary: PILL,
  socialButtonsBlockButton: PILL,
  formFieldInput: { borderRadius: "0.625rem" },
} as const;

/** The terracotta focus ring, resolved like the other Clerk colors (a real value, not a var). */
function readBrand(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
}
const noSubscribe = () => () => {};

/** The full appearance for the auth forms, or null on the server / before tokens resolve. */
export function useAuthAppearance(): ClerkAppearance | null {
  const base = useClerkAppearance();
  const brand = useSyncExternalStore(noSubscribe, readBrand, () => "");
  if (!base) return null;
  return withAuthElements(base, brand);
}

export function withAuthElements(base: ClerkAppearance, brand: string) {
  return {
    ...base,
    variables: {
      ...base.variables,
      ...(brand && !brand.includes("var(") ? { colorRing: brand } : {}),
    },
    elements: CLERK_ELEMENTS,
  };
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const appearance = useAuthAppearance();
  const loading = <LoadingState label="Loading…" rows={3} />;
  if (!appearance) return loading;
  return (
    <Suspense fallback={loading}>
      {mode === "sign-in" ? <SignIn appearance={appearance} /> : <SignUp appearance={appearance} />}
    </Suspense>
  );
}

/**
 * Sign-in / sign-up: an always-dark brand panel on the left (desktop only), and the Clerk form
 * on the right, following the owner's theme. At narrow widths: the form, with the logo on top.
 */
export function AuthLayout({ mode }: { mode: AuthMode }) {
  const copy = AUTH_COPY[mode];
  return (
    <div className="grid min-h-dvh bg-canvas text-ink lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        aria-label={`About ${APP_NAME}`}
        className="theme-dark relative isolate hidden flex-col justify-between overflow-hidden bg-canvas p-12 text-ink lg:flex"
      >
        <HeroArt className="-z-10" />
        <Link
          href="/"
          className="self-start rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <KivoLogo tone="paper" size={28} />
        </Link>
        <div className="flex max-w-md flex-col gap-8">
          <p
            data-testid="auth-line"
            className="font-display text-5xl leading-display tracking-display text-ink"
          >
            {copy.line}
          </p>
          <ul className="flex flex-col gap-3 text-sm text-ink-muted">
            {AUTH_BENEFITS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-subtle">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </aside>

      <main className="flex min-w-0 flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Back to {APP_NAME}
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-sm flex-col gap-6">
            {/* Narrow screens have no brand panel: the logo goes on top of the form. */}
            <div data-testid="auth-mobile-logo" className="lg:hidden">
              <span className="dark:hidden">
                <KivoLogo tone="ink" size={28} />
              </span>
              <span className="hidden dark:inline">
                <KivoLogo tone="paper" size={28} />
              </span>
            </div>
            <h1 className="font-display text-4xl leading-display tracking-display text-ink">
              {copy.title}
            </h1>
            <AuthForm mode={mode} />
          </div>
        </div>
      </main>
    </div>
  );
}
