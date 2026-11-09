/**
 * Join class names, skipping falsy values. Tiny on purpose: no dependency needed.
 *
 * It does not resolve conflicts: `cn("bg-glass", "bg-glass-strong")` keeps both, and the one
 * later in the generated CSS wins, not the one later in the string. For a different look, add an
 * explicit variant to the component (like GlassPanel's `surface`), not an overriding class.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
