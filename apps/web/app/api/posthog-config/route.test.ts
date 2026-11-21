import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/posthog-config", () => {
  it("reads new runtime values and returns only the public key and host", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    expect(GET().status).toBe(204);

    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_project");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com/");
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "test-private-key");
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      key: "phc_test_project",
      host: "https://eu.i.posthog.com",
    });
  });

  it.each([
    ["", "https://eu.i.posthog.com"],
    ["phx_test_personal", "https://eu.i.posthog.com"],
    ["phc_test_project", ""],
    ["phc_test_project", "https://user:password@eu.i.posthog.com"],
  ])("returns an empty response for unusable configuration", async (key, host) => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", key);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", host);
    const response = GET();

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("");
  });
});
