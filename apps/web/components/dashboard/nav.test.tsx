import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DASHBOARD_NAV, getActiveHref, getNavContext, projectIdFromPath } from "./nav";
import { NavLinks } from "./nav-links";
import { ProjectSwitcherView } from "./project-switcher";

const A = { id: "11111111-1111-4111-8111-111111111111", name: "Acme Co." };
const B = { id: "22222222-2222-4222-8222-222222222222", name: "Beta" };
const OTHER = "33333333-3333-4333-8333-333333333333";

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

describe("projectIdFromPath", () => {
  it.each([
    [`/dashboard/projects/${A.id}`, A.id],
    [`/dashboard/projects/${A.id}/knowledge`, A.id],
    ["/dashboard/projects/not-a-uuid", null],
    ["/dashboard", null],
  ])("%s → %s", (path, expected) => {
    expect(projectIdFromPath(path)).toBe(expected);
  });
});

describe("getNavContext", () => {
  it("shows Projects and Billing outside a project", () => {
    for (const path of ["/dashboard", "/dashboard/billing"]) {
      const context = getNavContext(path, [A, B]);
      expect(context.kind).toBe("account");
      expect(context.items.map((i) => i.label)).toEqual(["Projects", "Billing"]);
    }
    expect(getNavContext("/dashboard/billing", [A]).activeHref).toBe("/dashboard/billing");
  });

  it("shows the project's sections inside a project, with the right one active", () => {
    const context = getNavContext(`/dashboard/projects/${A.id}/conversations/abc`, [A, B]);
    expect(context.kind).toBe("project");
    if (context.kind !== "project") return;
    expect(context.project).toEqual(A);
    expect(context.items.map((i) => i.label)).toEqual(["Overview", "Knowledge", "Conversations", "Customize", "Install"]);
    expect(context.items[0]?.href).toBe(`/dashboard/projects/${A.id}`);
    expect(context.activeHref).toBe(`/dashboard/projects/${A.id}/conversations`);
    expect(getNavContext(`/dashboard/projects/${A.id}`, [A]).activeHref).toBe(`/dashboard/projects/${A.id}`);
  });

  it("falls back to the account nav for an id not in the owner's list (another owner's project)", () => {
    const context = getNavContext(`/dashboard/projects/${OTHER}/install`, [A, B]);
    expect(context.kind).toBe("account");
    expect(JSON.stringify(context)).not.toContain(OTHER);
  });
});

describe("NavLinks", () => {
  it("marks only the active link, with the terracotta indicator", () => {
    const out = renderToStaticMarkup(<NavLinks items={DASHBOARD_NAV} activeHref="/dashboard/billing" />);
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out.match(/data-testid="nav-indicator"/g)).toHaveLength(1);
    expect(out).toMatch(/<a[^>]*href="\/dashboard\/billing"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/dashboard\/billing"/);
    expect(out).toContain("Projects");
    expect(out.match(/<svg/g)).toHaveLength(2);
  });

  it("marks nothing when no item is active", () => {
    const out = renderToStaticMarkup(<NavLinks items={DASHBOARD_NAV} activeHref={null} />);
    expect(out).not.toContain("aria-current");
    expect(out).not.toContain("nav-indicator");
  });
});

describe("ProjectSwitcherView", () => {
  const base = { projects: [A, B], plan: "free" as const, onToggle: () => {}, menuId: "m" };

  it("shows the current project and plan, closed", () => {
    const out = renderToStaticMarkup(<ProjectSwitcherView {...base} current={A} open={false} />);
    expect(out).toContain("Acme Co.");
    expect(out).toContain("Free plan");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('role="menu"');
  });

  it("lists exactly the projects it's given (the owner's), plus All projects, when open", () => {
    const out = renderToStaticMarkup(<ProjectSwitcherView {...base} plan="pro" current={B} open />);
    expect(out).toContain("Pro plan");
    expect(out.match(/role="menuitem"/g)).toHaveLength(3);
    expect(out).toContain(`href="/dashboard/projects/${A.id}"`);
    expect(out).toContain(`href="/dashboard/projects/${B.id}"`);
    expect(out).toContain('href="/dashboard"');
    expect(out).toContain("All projects");
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("says All projects outside a project, and hides the plan when it can't be read", () => {
    const out = renderToStaticMarkup(<ProjectSwitcherView {...base} plan={null} current={null} open={false} />);
    expect(out).toContain("All projects");
    expect(out).not.toContain("plan");
  });
});
