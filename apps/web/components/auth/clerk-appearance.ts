"use client";

import { useSyncExternalStore } from "react";

// Clerk's appearance, from our design tokens, for the current theme.
//
// Clerk derives shades and contrast colors from its color variables with
// `color-mix()` and relative color syntax, and its docs recommend real color
// values over CSS variables (given `var(--accent)` it drew the billing
// "Subscribe" button white on near-white). So we read the tokens' computed
// values in the browser, where `var()`s are substituted, and pass those.
//
// app/globals.css stays the only place colors are defined (project.md §13).
// The values follow the theme class on <html>: switching Light / Dark gives
// Clerk the other set. To map another Clerk variable, add a line to CLERK_TOKENS.

/** Clerk appearance variable → the design token (in app/globals.css) it takes its value from. */
export const CLERK_TOKENS = {
  colorPrimary: "--accent",
  colorPrimaryForeground: "--accent-ink",
  colorForeground: "--ink",
  colorMutedForeground: "--ink-muted",
  colorBackground: "--card",
  colorInput: "--card",
  colorInputForeground: "--ink",
  colorNeutral: "--ink",
  colorDanger: "--danger",
  colorSuccess: "--success",
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

/** One appearance per theme class on <html>, so the snapshot is stable between renders. */
const cache = new Map<string, ClerkAppearance>();

function readAppearance(): ClerkAppearance {
  const root = document.documentElement;
  const key = root.className;
  let appearance = cache.get(key);
  if (!appearance) {
    const style = getComputedStyle(root);
    appearance = resolveClerkAppearance((token) => style.getPropertyValue(token));
    cache.set(key, appearance);
  }
  return appearance;
}

/** Re-reads when <html>'s class changes (the theme switch, or the OS for "System"). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * The appearance for the current theme, read from the page's computed tokens.
 * Null on the server, so Clerk never renders with unresolved colors.
 */
export function useClerkAppearance(): ClerkAppearance | null {
  return useSyncExternalStore(subscribe, readAppearance, () => null);
}
