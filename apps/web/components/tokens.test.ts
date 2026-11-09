import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guard for project.md §13: colors, radii, shadows and blur come only from app/globals.css.
const WEB = join(import.meta.dirname, "..");
const ROOTS = ["components", "app"].map((dir) => join(WEB, dir));

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
    ["arbitrary color, shadow or blur classes", /\b(?:bg|text|border|outline|ring|fill|stroke|shadow|blur|backdrop-blur|rounded)-\[/],
  ])("no %s outside globals.css", (_label, pattern) => {
    const offenders = sources.filter(({ text }) => pattern.test(text)).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
