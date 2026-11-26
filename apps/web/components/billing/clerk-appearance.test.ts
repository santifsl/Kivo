import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLERK_TOKENS, resolveClerkAppearance } from "./clerk-appearance";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** What the browser's computed style gives for a light-theme token: `var()`s substituted. */
function computed(token: string, seen = 0): string {
  const root = css.slice(css.indexOf(":root {"), css.indexOf(".theme-dark {"));
  const decl = (src: string) => new RegExp(`${token}:\\s*([^;]+);`).exec(src)?.[1]?.trim();
  const value = decl(root) ?? decl(css) ?? "";
  const ref = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return ref && seen < 5 ? computed(ref, seen + 1) : value;
}

describe("Clerk billing appearance", () => {
  it("maps every Clerk variable to a token defined in globals.css", () => {
    for (const token of Object.values(CLERK_TOKENS)) {
      expect(computed(token), token).not.toBe("");
    }
  });

  it("gives Clerk real colors, never CSS variables", () => {
    const { variables } = resolveClerkAppearance(computed);
    const colors = Object.entries(variables).filter(([name]) => name.startsWith("color"));
    expect(colors.map(([name]) => name).sort()).toEqual(
      Object.keys(CLERK_TOKENS)
        .filter((n) => n.startsWith("color"))
        .sort(),
    );
    for (const [name, value] of colors) expect(value, name).not.toContain("var(");
  });

  it("sets text on primary that differs from primary (Subscribe button, Active badge)", () => {
    const { variables } = resolveClerkAppearance(computed);
    expect(variables.colorPrimary).toBe(computed("--color-grey-950"));
    expect(variables.colorPrimaryForeground).toBe(computed("--color-white"));
    expect(variables.colorPrimaryForeground).not.toBe(variables.colorPrimary);
    expect(variables.borderRadius).toBe(computed("--radius-md"));
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
