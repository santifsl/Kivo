"use client";

import { useSyncExternalStore } from "react";

// Clerk's appearance for the billing components (pricing table, checkout,
// subscription details).
//
// Clerk derives shades and contrast colors from its color variables with
// `color-mix()` and relative color syntax, and its docs recommend real color
// values over CSS variables. Given `var(--accent)` it drew Pro's "Subscribe"
// button white on near-white and the "Active" badge blank. So we resolve our
// tokens to real colors in the browser and pass those.
//
// app/globals.css stays the only place colors are defined (project.md §13):
// a brand change there reaches Clerk with no change here. To map another
// Clerk variable, add one line to CLERK_TOKENS.

/** Clerk appearance variable → the design token (in app/globals.css) it takes its value from. */
export const CLERK_TOKENS = {
  colorPrimary: "--accent",
  colorPrimaryForeground: "--accent-ink",
  colorForeground: "--ink",
  colorMutedForeground: "--ink-muted",
  borderRadius: "--radius-md",
} as const;

export type ClerkVariables = Partial<Record<keyof typeof CLERK_TOKENS, string>>;
export interface ClerkAppearance {
  variables: ClerkVariables;
}

/**
 * Clerk variables from resolved token values. A token that didn't resolve to
 * a real value (empty, or still a `var()`) is left out, so Clerk falls back
 * to its own readable default instead of guessing from a variable.
 */
export function resolveClerkAppearance(read: (token: string) => string): ClerkAppearance {
  const variables: ClerkVariables = {};
  for (const [name, token] of Object.entries(CLERK_TOKENS) as [keyof ClerkVariables, string][]) {
    const value = read(token).trim();
    if (value && !value.includes("var(")) variables[name] = value;
  }
  return { variables };
}

let cached: ClerkAppearance | null = null;

/** Tokens don't change while the dashboard is open, so read them once. */
function readAppearance(): ClerkAppearance {
  if (!cached) {
    const style = getComputedStyle(document.documentElement);
    cached = resolveClerkAppearance((token) => style.getPropertyValue(token));
  }
  return cached;
}

const noSubscription = () => () => {};

/**
 * The appearance, read from the page's computed tokens in the browser (a
 * custom property's computed value has its `var()`s substituted). Null on the
 * server, so Clerk never renders with unresolved colors.
 */
export function useClerkAppearance(): ClerkAppearance | null {
  return useSyncExternalStore(noSubscription, readAppearance, () => null);
}
