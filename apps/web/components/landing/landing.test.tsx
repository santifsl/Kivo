import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, type PlanLimits } from "@kivo/shared";
import { buildInstallSnippet, EXAMPLE_PUBLIC_KEY } from "./install-snippet-data";
import { formatMonthlyPrice, getPricingRows } from "./pricing-data";
import { Reveal } from "./reveal";

describe("getPricingRows", () => {
  it("matches docs/project.md §5 exactly", () => {
    expect(getPricingRows()).toEqual([
      { label: "Projects", free: "1", pro: "5" },
      { label: "Messages / month (per project)", free: "100", pro: "2,000" },
      { label: "Knowledge sources (per project)", free: "3", pro: "25" },
      { label: "Button color", free: "Default", pro: "Any" },
      { label: "Button position", free: "Bottom right", pro: "Any corner" },
      { label: "Button label", free: "Default", pro: "Custom" },
      { label: "Open animation", free: "Fade", pro: "Fade / Slide / Scale" },
      { label: "Header text", free: "Default", pro: "Custom" },
      { label: "“Powered by” badge", free: "Shown", pro: "Hidden" },
    ]);
  });

  it("reads every value from the limits it is given (nothing hardcoded)", () => {
    const changed: Record<"free" | "pro", PlanLimits> = {
      free: { ...PLAN_LIMITS.free, projects: 2, messagesPerMonth: 150, knowledgeSources: 4, customColor: true },
      pro: { ...PLAN_LIMITS.pro, projects: 10, messagesPerMonth: 12345, knowledgeSources: 50, hideBadge: false, animations: ["fade"] },
    };
    const byLabel = Object.fromEntries(getPricingRows(changed).map((r) => [r.label, r]));
    expect(byLabel["Projects"]).toMatchObject({ free: "2", pro: "10" });
    expect(byLabel["Messages / month (per project)"]).toMatchObject({ free: "150", pro: "12,345" });
    expect(byLabel["Knowledge sources (per project)"]).toMatchObject({ free: "4", pro: "50" });
    expect(byLabel["Button color"]).toMatchObject({ free: "Any" });
    expect(byLabel["Open animation"]).toMatchObject({ pro: "Fade" });
    expect(byLabel["“Powered by” badge"]).toMatchObject({ pro: "Shown" });
  });
});

describe("formatMonthlyPrice", () => {
  it("reads PLAN_PRICES", () => {
    expect(formatMonthlyPrice("pro")).toBe("$9");
    expect(formatMonthlyPrice("free")).toBe("$0");
    expect(formatMonthlyPrice("pro", { free: 0, pro: 1200 })).toBe("$1,200");
  });
});

describe("buildInstallSnippet", () => {
  it("points at the app URL without a double slash", () => {
    expect(buildInstallSnippet("https://kivo.example/")).toBe(
      `<script src="https://kivo.example/widget.js" data-key="${EXAMPLE_PUBLIC_KEY}" async></script>`,
    );
  });

  it("falls back to a placeholder URL", () => {
    expect(buildInstallSnippet("")).toContain('src="https://your-app-url/widget.js"');
  });
});

describe("Reveal", () => {
  it("starts hidden, and reduced motion keeps it visible with no transition", () => {
    const out = renderToStaticMarkup(<Reveal>hi</Reveal>);
    expect(out).toContain('data-visible="false"');
    expect(out).toContain("opacity-0");
    for (const cls of ["motion-reduce:opacity-100", "motion-reduce:translate-y-0", "motion-reduce:transition-none"]) {
      expect(out).toContain(cls);
    }
  });
});
