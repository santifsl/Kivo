import type { Instrumentation } from "next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { PostHog, captureExceptionImmediate } = vi.hoisted(() => {
  const captureExceptionImmediate = vi.fn().mockResolvedValue(undefined);
  const PostHog = vi.fn(function () {
    return { captureExceptionImmediate };
  });
  return { PostHog, captureExceptionImmediate };
});

vi.mock("server-only", () => ({}));
vi.mock("posthog-node", () => ({ PostHog }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_project");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
});

afterEach(() => vi.unstubAllEnvs());

const request = { path: "/dashboard", method: "GET", headers: { cookie: "test-private-cookie" } };
const context = {
  routerKind: "App Router",
  routePath: "/dashboard",
  routeType: "render",
  revalidateReason: undefined,
} satisfies Parameters<Instrumentation.onRequestError>[2];

it("initializes one server SDK and reports a synthetic request error without request headers", async () => {
  const { register, onRequestError } = await import("../../instrumentation");
  const error = new Error("synthetic server exception");

  await register();
  await onRequestError(error, request, context);

  expect(PostHog).toHaveBeenCalledExactlyOnceWith(
    "phc_test_project",
    expect.objectContaining({ host: "https://eu.i.posthog.com", fetchRetryCount: 0 }),
  );
  expect(captureExceptionImmediate).toHaveBeenCalledExactlyOnceWith(error, {
    properties: { route: "/dashboard", route_type: "render", $process_person_profile: false },
  });
});

it("suppresses widget exceptions and keeps a rejected capture isolated", async () => {
  const { onRequestError } = await import("../../instrumentation");
  const error = new Error("test");
  await onRequestError(error, { ...request, path: "/embed?key=test" }, context);
  expect(captureExceptionImmediate).not.toHaveBeenCalled();

  captureExceptionImmediate.mockRejectedValueOnce(new Error("analytics is down"));
  await expect(onRequestError(error, request, context)).resolves.toBeUndefined();
  expect(captureExceptionImmediate).toHaveBeenCalledOnce();
});

it("skips server SDK initialization when unconfigured", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
  const { register, onRequestError } = await import("../../instrumentation");
  await register();
  await onRequestError(new Error("test"), request, context);
  expect(PostHog).not.toHaveBeenCalled();
});
