import { apiErrorSchema, DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// End to end through the real lookup and supabase-js; only the network is mocked.
// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const { GET, OPTIONS } = await import("./route");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");

const KEY = "pk_test_abcdefgh";
const ORIGIN = "https://example.com";

const STORED: WidgetConfig = {
  button_color: "#ff0066",
  position: "top-left",
  label: "Ask us",
  animation: "scale",
  header_text: "Hi there",
  show_badge: false,
};

function get(query: string): Promise<Response> {
  return GET(
    new Request(`https://kivo.test/api/widget/config${query}`, { headers: { Origin: ORIGIN } }),
  );
}

function expectRouteHeaders(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  expect(res.headers.get("cache-control")).toBe("no-store");
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expectRouteHeaders(res);
  const body = apiErrorSchema.parse(await res.json());
  expect(body.error.code).toBe(code);
}

const fetchMock = vi.fn<typeof fetch>();

/** PostgREST answers with this project row, or no row for `null`. */
function dbReturns(
  row: { widget_configs: WidgetConfig | null; accounts: { plan: string } } | null,
) {
  fetchMock.mockImplementation(async () => Response.json(row ? [row] : []));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv(SECRET_ENV, "sb_secret_test_456");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/widget/config", () => {
  it("Pro: 200 with the stored config", async () => {
    dbReturns({ widget_configs: STORED, accounts: { plan: "pro" } });
    const res = await get(`?key=${KEY}`);

    expect(res.status).toBe(200);
    expectRouteHeaders(res);
    expect(await res.json()).toEqual({ config: STORED });
  });

  it("Free with custom values stored: 200 with the defaults and the badge", async () => {
    dbReturns({ widget_configs: STORED, accounts: { plan: "free" } });
    const res = await get(`?key=${KEY}`);

    expect(res.status).toBe(200);
    expectRouteHeaders(res);
    expect(await res.json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
    expect(DEFAULT_WIDGET_CONFIG.show_badge).toBe(true);
  });

  it.each(["free", "pro"])(
    "%s: the body is only { config }, never the owner id or plan",
    async (plan) => {
      dbReturns({ widget_configs: STORED, accounts: { plan } });
      const text = await (await get(`?key=${KEY}`)).text();

      expect(Object.keys(JSON.parse(text) as object)).toEqual(["config"]);
      for (const leak of ["owner", "plan", "user_", plan, "accounts", "project_id", "public_key"]) {
        expect(text).not.toContain(leak);
      }
    },
  );

  it.each([
    ["no key", ""],
    ["a bad key format", "?key=not-a-key"],
    ["a too-short key", "?key=pk_abc"],
    ["an extra parameter", `?key=${KEY}&owner=user_1`],
  ])("%s: 400 invalid_input, no lookup", async (_, query) => {
    await expectError(await get(query), 400, "invalid_input");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unknown key: 404 not_found", async () => {
    dbReturns(null);
    await expectError(await get(`?key=${KEY}`), 404, "not_found");
  });

  it("database error: 500 internal, without the error text", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { code: "XX000", message: "connection to db.secret-host failed" },
        { status: 500 },
      ),
    );
    const res = await get(`?key=${KEY}`);
    expect(res.status).toBe(500);
    expectRouteHeaders(res);
    const text = await res.text();
    expect(text).not.toContain("secret-host");
    expect(apiErrorSchema.parse(JSON.parse(text)).error.code).toBe("internal");
  });
});

describe("OPTIONS /api/widget/config", () => {
  it("answers the preflight for any origin, GET only, no credentials", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });
});
