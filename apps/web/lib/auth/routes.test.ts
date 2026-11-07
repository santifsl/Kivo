import { describe, expect, it } from "vitest";
import { classifyRoute, normalizePath } from "./routes";

describe("classifyRoute", () => {
  it.each(["/dashboard", "/dashboard/", "/dashboard/projects/123", "/Dashboard", "//dashboard"])(
    "%s is an owner page",
    (path) => {
      expect(classifyRoute(path)).toBe("page");
    },
  );

  it.each([
    "/api/projects",
    "/api/projects/abc",
    "/api/projects/abc/knowledge",
    "/api/projects/abc/knowledge/upload-url",
    "/api/projects/abc/config",
    "/api/projects/abc/conversations",
    "/api/knowledge/abc",
    "/api/conversations/abc",
    "/API/Projects",
    "/api//projects",
  ])("%s is an owner API route", (path) => {
    expect(classifyRoute(path)).toBe("owner-api");
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/embed",
    "/embed/abc",
    "/api/widget/config",
    "/api/widget/chat",
    "/api/clerk/webhook",
    "/api/posthog-config",
  ])("%s is public", (path) => {
    expect(classifyRoute(path)).toBe("public");
  });

  it("does not match look-alike prefixes", () => {
    expect(classifyRoute("/dashboards")).toBe("public");
    expect(classifyRoute("/api/projectsx")).toBe("public");
  });
});

describe("normalizePath", () => {
  it("lowercases, collapses slashes and trims a trailing slash", () => {
    expect(normalizePath("//API//Projects/")).toBe("/api/projects");
    expect(normalizePath("/")).toBe("/");
  });
});
