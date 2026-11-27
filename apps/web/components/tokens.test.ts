import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_COLORS } from "./brand/colors";

// Guard for project.md §13: colors, radii, shadows and blur come only from app/globals.css.
const WEB = join(import.meta.dirname, "..");
const ROOTS = ["components", "app"].map((dir) => join(WEB, dir));

/**
 * The one other place literal colors may live: the brand palette for ImageResponse (OG image,
 * apple icon), which can't read CSS variables. It must match globals.css (tested below).
 */
const BRAND_COLORS_FILE = join(WEB, "components", "brand", "colors.ts");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("design tokens", () => {
  const sources = ROOTS.flatMap(files).map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("finds the source files", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each([
    ["hex colors", /#[0-9a-fA-F]{3,8}\b/],
    ["rgb()/hsl() colors", /\b(?:rgba?|hsla?|oklch)\(/],
    [
      "arbitrary color, shadow or blur classes",
      /\b(?:bg|text|border|outline|ring|fill|stroke|shadow|blur|backdrop-blur|rounded)-\[/,
    ],
  ])("no %s outside globals.css", (_label, pattern) => {
    const offenders = sources
      .filter(({ path, text }) => path !== BRAND_COLORS_FILE && pattern.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("allows only components/brand/colors.ts as an exception", () => {
    expect(sources.some(({ path }) => path === BRAND_COLORS_FILE)).toBe(true);
  });
});

describe("brand colors for ImageResponse", () => {
  const css = readFileSync(join(WEB, "app", "globals.css"), "utf8");
  const token = (name: string) =>
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)?.[1]?.toLowerCase();

  it.each([
    ["ink", "color-ink-950"],
    ["paper", "color-paper"],
    ["graphite", "color-graphite"],
    ["graphiteLight", "color-graphite-line"],
    ["stone", "color-stone"],
    ["terracotta", "color-terracotta"],
  ] as const)("BRAND_COLORS.%s matches --%s in globals.css", (key, name) => {
    expect(BRAND_COLORS[key].toLowerCase()).toBe(token(name));
  });

  it("every brand color is checked against globals.css", () => {
    expect(Object.keys(BRAND_COLORS).sort()).toEqual(
      ["graphite", "graphiteLight", "ink", "paper", "stone", "terracotta"].sort(),
    );
  });
});
