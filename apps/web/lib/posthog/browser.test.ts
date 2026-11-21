import type { PostHogConfig, PostHogInterface } from "posthog-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn<(key: string, options: Partial<PostHogConfig>) => void>(),
  set_config: vi.fn(),
  captureException: vi.fn(),
  get_property: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: sdk }));

const location = { pathname: "/", href: "https://kivo.example/" };
const fetchConfig = vi.fn<typeof fetch>();
const config = { key: "phc_test_project", host: "https://eu.i.posthog.com" };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  location.pathname = "/";
  fetchConfig.mockImplementation(async () => Response.json(config));
  vi.stubGlobal("window", { location });
  vi.stubGlobal("fetch", fetchConfig);
});

afterEach(() => vi.unstubAllGlobals());

describe("browser PostHog runtime", () => {
  it("loads runtime config and initializes the masked recorder once", async () => {
    const { getPosthogBrowser } = await import("./browser");
    await Promise.all([getPosthogBrowser(), getPosthogBrowser()]);

    expect(fetchConfig).toHaveBeenCalledExactlyOnceWith("/api/posthog-config", {
      cache: "no-store",
    });
    expect(sdk.init).toHaveBeenCalledExactlyOnceWith(
      config.key,
      expect.objectContaining({
        api_host: config.host,
        capture_exceptions: true,
        disable_session_recording: false,
        enable_recording_console_log: false,
        session_recording: expect.objectContaining({
          maskAllInputs: true,
          maskTextSelector: "*",
          blockSelector: expect.stringContaining("iframe"),
          recordHeaders: false,
          recordBody: false,
        }),
      }),
    );
    const privacy = sdk.init.mock.calls[0]?.[1].session_recording;
    expect(
      privacy?.maskCapturedNetworkRequestFn?.({
        name: "https://kivo.example/dashboard?token=test#secret",
        duration: 0,
        entryType: "navigation",
        startTime: 0,
      })?.name,
    ).toBe("https://kivo.example/dashboard");
  });

  it("pauses replay before excluded routes and resumes on committed dashboard routes", async () => {
    const { onRouterTransitionStart } = await import("../../instrumentation-client");
    const { getPosthogBrowser, updatePosthogReplay } = await import("./browser");
    await getPosthogBrowser();

    onRouterTransitionStart("/embed?key=test");
    location.pathname = "/embed";
    updatePosthogReplay(location.pathname);
    expect(sdk.set_config).toHaveBeenCalledExactlyOnceWith({ disable_session_recording: true });

    location.pathname = "/dashboard/projects/test";
    updatePosthogReplay(location.pathname);
    expect(sdk.set_config).toHaveBeenLastCalledWith({ disable_session_recording: false });

    onRouterTransitionStart("/sign-in");
    expect(sdk.set_config).toHaveBeenLastCalledWith({ disable_session_recording: true });
  });

  it("starts an excluded page without replay and never initializes on the embed entry point", async () => {
    const { getPosthogBrowser } = await import("./browser");
    location.pathname = "/embed";
    await expect(getPosthogBrowser()).resolves.toBeUndefined();
    expect(fetchConfig).not.toHaveBeenCalled();

    location.pathname = "/sign-in";
    await getPosthogBrowser();
    expect(sdk.init).toHaveBeenCalledWith(
      config.key,
      expect.objectContaining({ disable_session_recording: true }),
    );
  });

  it("captures a synthetic client error and suppresses errors on the embed", async () => {
    const { capturePosthogBrowserError } = await import("./browser");
    const error = new Error("synthetic client exception");
    await capturePosthogBrowserError(error);
    location.pathname = "/embed";
    await capturePosthogBrowserError(error);

    expect(sdk.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it("keeps analytics disabled for an empty config or a failing runtime request", async () => {
    const { capturePosthogBrowserError } = await import("./browser");
    fetchConfig.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(capturePosthogBrowserError(new Error("test"))).resolves.toBeUndefined();
    expect(sdk.init).not.toHaveBeenCalled();

    vi.resetModules();
    const { getPosthogBrowser } = await import("./browser");
    fetchConfig.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(getPosthogBrowser()).resolves.toBeUndefined();
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it("merges the landing identity with the Clerk owner and captures only the project ID", async () => {
    const { getPosthogBrowser, syncPosthogOwner, captureSnippetCopied } = await import("./browser");
    await getPosthogBrowser();
    expect(sdk.identify).not.toHaveBeenCalled();

    await syncPosthogOwner("user_clerk", () => true);
    expect(sdk.identify).toHaveBeenCalledExactlyOnceWith("user_clerk");
    expect(sdk.reset).not.toHaveBeenCalled();

    sdk.get_property.mockReturnValue("user_clerk");
    await captureSnippetCopied("user_clerk", "test-project", () => false);
    expect(sdk.capture).not.toHaveBeenCalled();
    await captureSnippetCopied("user_clerk", "test-project", () => true);
    expect(sdk.identify).toHaveBeenCalledOnce();
    expect(sdk.capture).toHaveBeenCalledExactlyOnceWith("snippet_copied", {
      project_id: "test-project",
    });
  });

  it("ignores stale auth state and resets a different owner before identifying", async () => {
    const { syncPosthogOwner } = await import("./browser");
    sdk.get_property.mockReturnValue("user_previous");

    await syncPosthogOwner("user_stale", () => false);
    expect(sdk.identify).not.toHaveBeenCalled();
    expect(sdk.reset).not.toHaveBeenCalled();

    await syncPosthogOwner("user_current", () => true);
    expect(sdk.reset).toHaveBeenCalledBefore(sdk.identify);
    expect(sdk.identify).toHaveBeenCalledExactlyOnceWith("user_current");
  });

  it("resets a persisted owner on Clerk's sign-out destination", async () => {
    const { getPosthogBrowser } = await import("./browser");
    location.pathname = "/sign-in";
    sdk.get_property.mockReturnValue("user_previous");
    sdk.init.mockImplementation((_key, options) =>
      options.loaded?.(sdk as unknown as PostHogInterface),
    );

    await getPosthogBrowser();
    expect(sdk.reset).toHaveBeenCalledOnce();
    expect(sdk.identify).not.toHaveBeenCalled();
  });
});
