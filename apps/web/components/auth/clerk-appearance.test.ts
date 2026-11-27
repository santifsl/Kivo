import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLERK_TOKENS, resolveClerkAppearance } from "./clerk-appearance";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The body of the first rule whose selector starts with `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector}`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("\n}", open));
}

const THEMES = {
  light: block(":root,\n.light"),
  dark: block(":root.dark,\n.theme-dark"),
} as const;

/** What the browser's computed style gives for a token in a theme: `var()`s substituted. */
function computed(theme: keyof typeof THEMES, token: string, depth = 0): string {
  const decl = (src: string) => new RegExp(`${token}:\\s*([^;]+);`).exec(src)?.[1]?.trim();
  const value = decl(THEMES[theme]) ?? decl(THEMES.light) ?? decl(css) ?? "";
  const ref = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return ref && depth < 5 ? computed(theme, ref, depth + 1) : value;
}

describe.each(["light", "dark"] as const)("Clerk appearance, %s theme", (theme) => {
  const { variables } = resolveClerkAppearance((token) => computed(theme, token));

  it("maps every Clerk variable to a token defined in globals.css", () => {
    for (const token of Object.values(CLERK_TOKENS)) {
      expect(computed(theme, token), token).not.toBe("");
    }
  });

  it("gives Clerk real colors, never CSS variables", () => {
    const colors = Object.entries(variables).filter(([name]) => name.startsWith("color"));
    expect(colors.map(([name]) => name).sort()).toEqual(
      Object.keys(CLERK_TOKENS)
        .filter((n) => n.startsWith("color"))
        .sort(),
    );
    for (const [name, value] of colors) expect(value, name).not.toContain("var(");
  });

  it("text on primary differs from primary, and text differs from the card", () => {
    expect(variables.colorPrimaryForeground).not.toBe(variables.colorPrimary);
    expect(variables.colorForeground).not.toBe(variables.colorBackground);
    expect(variables.borderRadius).toBe(computed(theme, "--radius-md"));
  });
});

describe("Clerk appearance per theme", () => {
  const light = resolveClerkAppearance((t) => computed("light", t)).variables;
  const dark = resolveClerkAppearance((t) => computed("dark", t)).variables;

  it("light: ink buttons and text on a white card", () => {
    expect(light.colorPrimary).toBe(computed("light", "--color-ink-950"));
    expect(light.colorBackground).toBe(computed("light", "--color-white"));
  });

  it("dark: paper buttons and text on a graphite card", () => {
    expect(dark.colorPrimary).toBe(computed("dark", "--color-paper"));
    expect(dark.colorForeground).toBe(computed("dark", "--color-paper"));
    expect(dark.colorBackground).toBe(computed("dark", "--color-graphite"));
  });

  it("leaves out a token that didn't resolve, so Clerk uses its default", () => {
    const { variables } = resolveClerkAppearance((token) =>
      token === "--accent" ? "var(--color-grey-950)" : token === "--ink" ? "  " : "x",
    );
    expect(variables).not.toHaveProperty("colorPrimary");
    expect(variables).not.toHaveProperty("colorForeground");
    expect(variables.colorPrimaryForeground).toBe("x");
  });
});
