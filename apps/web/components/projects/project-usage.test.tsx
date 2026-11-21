import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectUsage } from "./project-usage";

const now = new Date("2026-12-01T00:00:00.000Z");
const project = { messages_used: 99, period_start: "2026-12-01T00:00:00.000Z" };

describe("ProjectUsage", () => {
  it.each([
    ["free", "99 / 100"],
    ["pro", "99 / 2,000"],
  ] as const)("shows this month's count and the %s limit", (plan, usage) => {
    const html = renderToStaticMarkup(<ProjectUsage project={project} plan={plan} now={now} />);
    expect(html).toContain("Messages used this month:");
    expect(html).toContain(usage);
  });

  it.each([
    ["the last microsecond of the previous UTC month", "2026-11-30T23:59:59.999999Z", "0 / 100"],
    ["the UTC boundary expressed with an offset", "2026-11-30T19:00:00-05:00", "99 / 100"],
    ["a new project's period later this month", "2026-12-10T09:00:00Z", "99 / 100"],
    ["a future period", "2027-01-01T00:00:00Z", "99 / 100"],
  ])("matches the quota rollover for %s", (_, period_start, usage) => {
    const html = renderToStaticMarkup(
      <ProjectUsage project={{ ...project, period_start }} plan="free" now={now} />,
    );
    expect(html).toContain(usage);
  });

  it("shows the actual count after a downgrade even when it exceeds the current limit", () => {
    const html = renderToStaticMarkup(
      <ProjectUsage project={{ ...project, messages_used: 125 }} plan="free" now={now} />,
    );
    expect(html).toContain("125 / 100");
  });

  it("shows an unavailable state when the owner plan cannot be read", () => {
    const html = renderToStaticMarkup(<ProjectUsage project={project} plan={null} now={now} />);
    expect(html).toContain("Message usage unavailable");
    expect(html).not.toContain("99 / 100");
  });
});
