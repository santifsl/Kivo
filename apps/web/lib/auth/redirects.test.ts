import { describe, expect, it } from "vitest";
import { CLERK_REDIRECT_PARAM, stripUntrustedClerkRedirect } from "./redirects";

const ORIGIN = "https://kivo.example";
const url = (query: string) => new URL(`${ORIGIN}/sign-in${query}`);
const param = (value: string) => `${CLERK_REDIRECT_PARAM}=${encodeURIComponent(value)}`;

describe("stripUntrustedClerkRedirect", () => {
  it("leaves requests without the param alone", () => {
    expect(stripUntrustedClerkRedirect(url(""))).toBeNull();
    expect(stripUntrustedClerkRedirect(url("?redirect_url=%2Fdashboard"))).toBeNull();
  });

  it("allows a redirect back to our own origin", () => {
    expect(stripUntrustedClerkRedirect(url(`?${param(`${ORIGIN}/dashboard`)}`))).toBeNull();
  });

  it.each([
    "https://attacker.example/x",
    "https://kivo.example.attacker.example/",
    "http://kivo.example/", // other scheme
    "https://kivo.example:8443/", // other port
    "//attacker.example/x",
    "javascript:alert(1)",
    "not a url",
  ])("strips %s and keeps the rest of the URL", (value) => {
    const cleaned = stripUntrustedClerkRedirect(url(`?a=1&${param(value)}`));
    expect(cleaned?.toString()).toBe(`${ORIGIN}/sign-in?a=1`);
  });

  it("strips every copy if any one is untrusted", () => {
    const query = `?${param(`${ORIGIN}/ok`)}&${param("https://attacker.example/")}`;
    expect(stripUntrustedClerkRedirect(url(query))?.searchParams.has(CLERK_REDIRECT_PARAM)).toBe(false);
  });
});
