import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "../../proxy";
import { OWNER_API_PREFIXES, PROTECTED_PAGE_PREFIXES, WIDGET_PREFIXES } from "./routes";

const matches = (path: string) =>
  unstable_doesMiddlewareMatch({ config, url: `https://app.example${path}` });

describe("proxy matcher (Clerk runs only where matched)", () => {
  it.each([
    "/embed",
    "/embed?key=pk_abc123XYZ_789&origin=https%3A%2F%2Fhost.example",
    "/embed/anything",
    "/api/widget/config",
    "/api/widget/config?key=pk_abc123XYZ_789",
    "/api/widget/chat",
    "/api/widget",
  ])("does not run on the widget: %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  it.each([
    "/",
    "/dashboard",
    "/dashboard/projects/abc",
    "/dashboard/billing",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/api/projects",
    "/api/projects/abc/config",
    "/api/knowledge/abc",
    "/api/conversations/abc",
    "/api/clerk/webhook",
    "/api/posthog-config",
    "/api/projects/report.png",
    "/trpc/anything",
  ])("still runs on %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each(["/embedded", "/embeds/x", "/api/widgets", "/api/widgetx/config"])(
    "only skips whole widget segments, not look-alikes: %s",
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it("still skips Next internals and static files", () => {
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/widget.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });

  it("keeps the lists in sync: widget prefixes are skipped, owner prefixes are matched", () => {
    for (const prefix of WIDGET_PREFIXES) expect(matches(prefix)).toBe(false);
    for (const prefix of [...OWNER_API_PREFIXES, ...PROTECTED_PAGE_PREFIXES]) {
      expect(matches(prefix)).toBe(true);
    }
  });
});
