import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null, getToken: async () => null }) }));

const { PlanBadge, PlanBadgeView } = await import("./plan-badge");

describe("PlanBadge", () => {
  it.each([
    ["free", "Free"],
    ["pro", "Pro"],
  ] as const)("renders %s as %s", async (plan, label) => {
    const html = renderToStaticMarkup(await PlanBadge({ loadPlan: async () => plan }));
    expect(html).toContain(`data-plan="${plan}"`);
    expect(html).toContain(`>${label}</span>`);
    expect(html).toBe(renderToStaticMarkup(<PlanBadgeView plan={plan} />));
  });

  it("renders nothing when the plan can't be read", async () => {
    expect(await PlanBadge({ loadPlan: async () => null })).toBeNull();
  });
});
