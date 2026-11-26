import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

const headersFor = async (path: string) => {
  const response = await unstable_getResponseFromNextConfig({
    url: `https://app.example${path}`,
    nextConfig,
    headers: { origin: "https://host.example" },
  });
  return response.headers;
};

describe("framing policy", () => {
  it.each([
    "/",
    "/dashboard",
    "/dashboard/projects/test",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/embedded",
    "/embed/other",
  ])("allows only same-origin framing for %s", async (path) => {
    expect((await headersFor(path)).get("content-security-policy")).toBe("frame-ancestors 'self'");
  });

  it.each(["/embed", "/embed/", "/embed?key=pk_test_abcdefgh"])(
    "leaves %s frameable by a widget host",
    async (path) => {
      const headers = await headersFor(path);
      expect(headers.get("content-security-policy")).toBeNull();
      expect(headers.get("x-frame-options")).toBeNull();
    },
  );
});
