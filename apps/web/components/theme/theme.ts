// Light / Dark / System theme for the dashboard and sign-in/up. project.md §13.
//
// The choice is stored in localStorage and applied to <html> as a `light` or
// `dark` class: before paint by the inline script (theme-script.ts), then kept
// in sync by ThemeSync and ThemeSwitch. The landing page is always dark
// (`.theme-dark` in its markup) and /embed is never themed.

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_CHOICES = ["light", "dark", "system"] as const satisfies readonly ThemeChoice[];
export const DEFAULT_THEME: ThemeChoice = "system";

/** localStorage key for the owner's choice. */
export const THEME_STORAGE_KEY = "theme";

/** Fired on window when the choice changes in this tab. */
export const THEME_CHANGE_EVENT = "themechange";

/** Pages that are never themed: the widget panel lives inside customers' sites. */
export const UNTHEMED_PATH_PREFIX = "/embed";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** A stored value as a choice: anything unknown (or nothing) is the default. */
export function parseThemeChoice(stored: string | null | undefined): ThemeChoice {
  return stored === "light" || stored === "dark" || stored === "system" ? stored : DEFAULT_THEME;
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

export function isUnthemedPath(pathname: string): boolean {
  return pathname === UNTHEMED_PATH_PREFIX || pathname.startsWith(`${UNTHEMED_PATH_PREFIX}/`);
}

/** Sets the resolved theme's class (and `color-scheme`) on <html>, removing the other. */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.classList.remove(theme === "dark" ? "light" : "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

/**
 * The latest choice made in this tab when it couldn't be saved (storage blocked or full), so the
 * switch and the page still follow it until reload. Cleared when another tab saves a choice.
 */
let unsavedChoice: ThemeChoice | null = null;

export function readThemeChoice(): ThemeChoice {
  if (unsavedChoice) return unsavedChoice;
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME; // Storage blocked (private mode, sandboxed frame).
  }
}

/** Another tab saved a choice: storage is the source of truth again. */
export function forgetUnsavedChoice(): void {
  unsavedChoice = null;
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Applies the stored choice to this page, unless it's an unthemed page. */
export function syncTheme(): void {
  if (isUnthemedPath(window.location.pathname)) return;
  applyTheme(document.documentElement, resolveTheme(readThemeChoice(), systemPrefersDark()));
}

/** Saves a new choice, applies it, and tells this tab's listeners. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    unsavedChoice = null;
  } catch {
    unsavedChoice = choice; // Not saved: kept in memory so this page still follows it.
  }
  syncTheme();
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
