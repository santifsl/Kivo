import { apiErrorSchema, DEFAULT_WIDGET_CONFIG, type ApiErrorCode, type Plan } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../../app/api/projects/[id]/config/route";
import { fakePostgrest } from "./fake-postgrest";

vi.mock("server-only", () => ({}));

let userId: string | null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId, getToken: async () => (userId ? `token_${userId}` : null) }),
}));

const ID = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const PROJECTS = "/rest/v1/projects";
const ACCOUNTS = "/rest/v1/accounts";
const CONFIGS = "/rest/v1/widget_configs";
const PUBLISHABLE = "sb_publishable_test_123";
const SECRET = "sb_secret_test_456";
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");

let pg: ReturnType<typeof fakePostgrest>;

beforeEach(() => {
  userId = "user_a";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function ownedProject(plan: Plan) {
  pg.on("GET", PROJECTS, { body: [{ id: ID }] });
  pg.on("GET", ACCOUNTS, { body: [{ plan }] });
}

function patch(body: unknown, id = ID) {
  return PATCH(
    new Request(`https://kivo.test/api/projects/${id}/config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function expectError(response: Response, status: number, code: ApiErrorCode) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(apiErrorSchema.parse(await response.json()).error.code).toBe(code);
}

function expectOnlyOwnerReads(paths: string[]) {
  expect(pg.requests.map(({ method, path }) => [method, path])).toEqual(
    paths.map((path) => ["GET", path]),
  );
  for (const request of pg.requests) {
    expect(request.headers.get("authorization")).toBe("Bearer token_user_a");
    expect(request.headers.get("apikey")).toBe(PUBLISHABLE);
  }
}

describe("PATCH /api/projects/:id/config", () => {
  it("returns 401 signed out without touching Supabase", async () => {
    userId = null;

    await expectError(await patch({ label: "Help" }), 401, "unauthorized");
    expectOnlyOwnerReads([]);
  });

  it("returns 404 when RLS hides another owner's project", async () => {
    pg.on("GET", PROJECTS, { body: [] });

    await expectError(await patch({ label: "Help" }), 404, "not_found");
    expectOnlyOwnerReads([PROJECTS]);
    expect(pg.requests[0]?.params.get("id")).toBe(`eq.${ID}`);
  });

  it("returns 402 for a Free owner without a write", async () => {
    ownedProject("free");

    await expectError(await patch({ label: "Help" }), 402, "payment_required");
    expectOnlyOwnerReads([PROJECTS, ACCOUNTS]);
  });

  it.each([{}, { button_color: "blue" }, { label: "Help", project_id: ID }, { show_badge: null }])(
    "rejects invalid or unauthorized fields without a write (%j)",
    async (body) => {
      ownedProject("pro");

      await expectError(await patch(body), 400, "invalid_input");
      expectOnlyOwnerReads([PROJECTS, ACCOUNTS]);
    },
  );

  it("saves just the validated Pro fields and returns the full saved config", async () => {
    ownedProject("pro");
    const stored = {
      ...DEFAULT_WIDGET_CONFIG,
      button_color: "#234567",
      header_text: "  Existing header  ",
    };
    pg.on("PATCH", CONFIGS, ({ body }) => ({ body: [{ ...stored, ...(body as object) }] }));

    const response = await patch({ label: " Help ", show_badge: false });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      config: { ...stored, label: "Help", show_badge: false },
    });
    expect(pg.requests.map(({ method, path }) => [method, path])).toEqual([
      ["GET", PROJECTS],
      ["GET", ACCOUNTS],
      ["PATCH", CONFIGS],
    ]);
    const [write] = pg.to(CONFIGS, "PATCH");
    expect(write?.headers.get("apikey")).toBe(SECRET);
    expect(write?.params.get("project_id")).toBe(`eq.${ID}`);
    expect(write?.body).toEqual({ label: "Help", show_badge: false });
    expect(write?.params.get("select")).toBe(
      "button_color,position,label,animation,header_text,show_badge",
    );
  });
});
