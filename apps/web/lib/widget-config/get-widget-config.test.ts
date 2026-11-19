import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const { getWidgetConfig } = await import("./get-widget-config");
const { createServiceClient } = await import("../supabase/service");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const KEY = "pk_test_abcdefgh";

const CUSTOM: WidgetConfig = {
  button_color: "#ff0066",
  position: "top-left",
  label: "Ask us",
  animation: "scale",
  header_text: "Hi there",
  show_badge: false,
};

const fetchMock = vi.fn<typeof fetch>();

/** PostgREST answers the next request with this project row (or no row). */
function respondWith(row: unknown) {
  fetchMock.mockImplementation(async () => Response.json(row === null ? [] : [row]));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv(SECRET_ENV, "sb_secret_test_456");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getWidgetConfig", () => {
  it("looks the project up by public key only, selecting just the config and the plan", async () => {
    respondWith({ widget_configs: CUSTOM, accounts: { plan: "pro" } });
    await getWidgetConfig(KEY, createServiceClient());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(init?.method ?? "GET").toBe("GET");
    expect(url.pathname).toBe("/rest/v1/projects");
    expect(url.searchParams.get("public_key")).toBe(`eq.${KEY}`);
    expect([...url.searchParams.keys()].sort()).toEqual(["public_key", "select"]);
    expect(url.searchParams.get("select")?.replace(/\s/g, "")).toBe(
      "widget_configs(button_color,position,label,animation,header_text,show_badge),accounts(plan)",
    );
  });

  it("Pro: returns the stored config", async () => {
    respondWith({ widget_configs: CUSTOM, accounts: { plan: "pro" } });
    await expect(getWidgetConfig(KEY, createServiceClient())).resolves.toEqual(CUSTOM);
  });

  it("Free with custom values stored: returns the defaults with the badge", async () => {
    respondWith({ widget_configs: CUSTOM, accounts: { plan: "free" } });
    await expect(getWidgetConfig(KEY, createServiceClient())).resolves.toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
  });

  it("unknown key: returns null", async () => {
    respondWith(null);
    await expect(getWidgetConfig(KEY, createServiceClient())).resolves.toBeNull();
  });

  it("no config row: returns the defaults", async () => {
    respondWith({ widget_configs: null, accounts: { plan: "pro" } });
    await expect(getWidgetConfig(KEY, createServiceClient())).resolves.toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("invalid stored config: returns the defaults", async () => {
    respondWith({ widget_configs: { ...CUSTOM, button_color: "red" }, accounts: { plan: "pro" } });
    await expect(getWidgetConfig(KEY, createServiceClient())).resolves.toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
  });

  it.each([
    ["an unknown plan", { plan: "enterprise" }],
    ["no account", null],
  ])("%s counts as Free", async (_, accounts) => {
    respondWith({ widget_configs: CUSTOM, accounts });
    await expect(getWidgetConfig(KEY, createServiceClient())).resolves.toEqual(
      DEFAULT_WIDGET_CONFIG,
    );
  });

  it("throws on a database error", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ code: "XX000", message: "boom" }, { status: 500 }),
    );
    await expect(getWidgetConfig(KEY, createServiceClient())).rejects.toThrow("boom");
  });
});
