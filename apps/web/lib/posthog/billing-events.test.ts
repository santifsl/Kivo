import { beforeEach, expect, it, vi } from "vitest";

const { after, captureImmediate, getPosthogServer } = vi.hoisted(() => ({
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  captureImmediate: vi.fn().mockResolvedValue(undefined),
  getPosthogServer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after }));
vi.mock("./server", () => ({ getPosthogServer }));

import { trackUpgrade } from "./billing-events";

beforeEach(() => {
  after.mockReset();
  captureImmediate.mockClear();
  getPosthogServer.mockReset().mockReturnValue({ captureImmediate });
});

it("sends upgraded with the Clerk owner ID after the response", async () => {
  trackUpgrade("user_123");
  expect(captureImmediate).not.toHaveBeenCalled();
  await after.mock.calls[0]?.[0]();
  expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
    event: "upgraded",
    distinctId: "user_123",
  });
});

it("skips capture when PostHog is unconfigured", () => {
  getPosthogServer.mockReturnValue(undefined);
  trackUpgrade("user_123");
  expect(after).not.toHaveBeenCalled();
});

it("isolates a failed capture from billing", async () => {
  captureImmediate.mockRejectedValueOnce(new Error("PostHog unavailable"));
  trackUpgrade("user_123");
  await expect(after.mock.calls[0]?.[0]()).resolves.toBeUndefined();
});
