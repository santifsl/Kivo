import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV, getActiveHref } from "./nav";
import { NavLinks } from "./nav-links";

describe("getActiveHref", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/", "/dashboard"],
    ["/dashboard/projects/abc", "/dashboard"],
    ["/dashboard/billing", "/dashboard/billing"],
    ["/dashboard/billing/", "/dashboard/billing"],
    ["/dashboard//billing", "/dashboard/billing"],
    ["/dashboard/billing/history", "/dashboard/billing"],
    ["/dashboard/billingx", "/dashboard"],
    ["/", null],
    ["/dashboards", null],
  ])("%s → %s", (path, expected) => {
    expect(getActiveHref(path)).toBe(expected);
  });
});

describe("NavLinks", () => {
  it("marks only the active link with aria-current", () => {
    const out = renderToStaticMarkup(<NavLinks items={DASHBOARD_NAV} activeHref="/dashboard/billing" />);
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/<a[^>]*href="\/dashboard\/billing"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/dashboard\/billing"/);
    expect(out).toContain("Projects");
  });

  it("marks nothing when no item is active", () => {
    expect(renderToStaticMarkup(<NavLinks items={DASHBOARD_NAV} activeHref={null} />)).not.toContain("aria-current");
  });
});
