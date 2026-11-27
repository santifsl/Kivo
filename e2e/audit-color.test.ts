import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA, parseColor, terracottaChecks } from "./audit-color.ts";

describe("audit color math", () => {
  it("parses short and long hex", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#C96A3F")).toEqual([201, 106, 63]);
    expect(() => parseColor("red")).toThrow();
  });

  it("matches known WCAG ratios", () => {
    expect(contrastRatio(parseColor("#000"), parseColor("#fff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor("#777"), parseColor("#fff"))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(parseColor("#fff"), parseColor("#000"))).toBeCloseTo(21, 5);
  });

  it("applies the AA thresholds", () => {
    expect(meetsAA(4.5, false)).toBe(true);
    expect(meetsAA(4.49, false)).toBe(false);
    expect(meetsAA(3, true)).toBe(true);
    expect(meetsAA(2.99, true)).toBe(false);
  });

  it("reports terracotta on ink and on paper (globals.css says 5.3:1 and 3.5:1)", () => {
    const byLabel = Object.fromEntries(terracottaChecks().map((c) => [c.label, c]));
    expect(byLabel["terracotta on ink"]?.ratio).toBeCloseTo(5.3, 1);
    expect(byLabel["terracotta on ink"]?.normalText).toBe(true);
    expect(byLabel["terracotta on paper"]?.ratio).toBeCloseTo(3.5, 1);
    expect(byLabel["terracotta on paper"]?.normalText).toBe(false);
    expect(byLabel["terracotta on paper"]?.largeText).toBe(true);
  });
});
