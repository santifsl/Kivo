import { apiErrorSchema, publicKeySchema, type Project } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "./fake-postgrest";

// Tests for app/api/projects/route.ts and app/api/projects/[id]/route.ts.
// Real handlers and supabase-js; Clerk and the network (PostgREST) are mocked.
// Tenant scoping itself is RLS, tested on pglite in packages/db; here we check
// that owner reads go out with the caller's token and no owner filter.

vi.mock("server-only", () => ({}));

let userId: string | null = "user_a";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId, getToken: async () => (userId ? `token_${userId}` : null) }),
}));

const projectsRoute = await import("../../app/api/projects/route");
const projectRoute = await import("../../app/api/projects/[id]/route");

// Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const PUBLISHABLE = "sb_publishable_test_123";
const SECRET = "sb_secret_test_456";

const ID = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const OTHER_ID = "0b7e3c1a-5f4d-4e2b-8a9c-1d2e3f4a5b6c";

function project(id: string, name: string, key = "pk_test_abcdefgh"): Project {
  return {
    id,
    name,
    public_key: key,
    messages_used: 0,
    period_start: "2026-11-19T00:00:00+00:00",
    created_at: "2026-11-19T00:00:00+00:00",
  };
}

let pg: ReturnType<typeof fakePostgrest>;

beforeEach(() => {
  userId = "user_a";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
  pg = fakePostgrest();
  vi.stubGlobal("fetch", pg.fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The account row exists (POST upsert) and has `plan` (owner-client read). */
function account(plan: string) {
  pg.on("POST", "/rest/v1/accounts", { status: 201, body: null });
  pg.on("GET", "/rest/v1/accounts", { body: [{ plan }] });
}

/** create_project returns a project built from its arguments. */
function rpcCreates() {
  pg.on("POST", "/rest/v1/rpc/create_project", (req) => {
    const args = req.body as { p_name: string; p_public_key: string; p_owner_id: string };
    return { body: { ...project(ID, args.p_name, args.p_public_key), owner_id: args.p_owner_id } };
  });
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const post = (body: unknown) =>
  projectsRoute.POST(new Request("https://kivo.test/api/projects", json(body)));
const patch = (id: string, body: unknown) =>
  projectRoute.PATCH(
    new Request(`https://kivo.test/api/projects/${id}`, { ...json(body), method: "PATCH" }),
    {
      params: Promise.resolve({ id }),
    },
  );
const del = (id: string) =>
  projectRoute.DELETE(new Request(`https://kivo.test/api/projects/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(apiErrorSchema.parse(await res.json()).error.code).toBe(code);
}

/** Owner-client requests carry the caller's Clerk token and the publishable key, never the secret. */
function expectOwnerClient(path: string, sub = "user_a", method?: string) {
  const reqs = pg.to(path, method);
  expect(reqs.length).toBeGreaterThan(0);
  for (const r of reqs) {
    expect(r.headers.get("authorization")).toBe(`Bearer token_${sub}`);
    expect(r.headers.get("apikey")).toBe(PUBLISHABLE);
  }
}

describe("signed out", () => {
  beforeEach(() => {
    userId = null;
  });

  it.each([
    ["GET /api/projects", () => projectsRoute.GET()],
    ["POST /api/projects", () => post({ name: "Site" })],
    ["PATCH /api/projects/:id", () => patch(ID, { name: "New" })],
    ["DELETE /api/projects/:id", () => del(ID)],
  ])("%s → 401 unauthorized, no database call", async (_, call) => {
    await expectError(await call(), 401, "unauthorized");
    expect(pg.requests).toHaveLength(0);
  });
});

describe("GET /api/projects", () => {
  it("returns what RLS gives the caller, newest first, plus the plan from the database", async () => {
    const rows = [project(ID, "Newer"), project(OTHER_ID, "Older", "pk_test_zyxwvuts")];
    pg.on("GET", "/rest/v1/projects", { body: rows });
    pg.on("GET", "/rest/v1/accounts", { body: [{ plan: "pro" }] });

    const res = await projectsRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ projects: rows, plan: "pro" });

    const [list] = pg.to("/rest/v1/projects");
    expect(list?.params.get("order")).toBe("created_at.desc");
    expect(list?.params.get("select")?.replace(/\s/g, "")).toBe(
      "id,name,public_key,messages_used,period_start,created_at",
    );
    // No manual owner filter: RLS scopes it to the token's user.
    expect([...(list?.params.keys() ?? [])].sort()).toEqual(["order", "select"]);
    expectOwnerClient("/rest/v1/projects");
    expectOwnerClient("/rest/v1/accounts");
  });

  it("uses each caller's own token", async () => {
    userId = "user_b";
    pg.on("GET", "/rest/v1/projects", { body: [] });
    pg.on("GET", "/rest/v1/accounts", { body: [{ plan: "free" }] });
    expect(await (await projectsRoute.GET()).json()).toEqual({ projects: [], plan: "free" });
    expectOwnerClient("/rest/v1/projects", "user_b");
  });

  it("can't read the plan → 500", async () => {
    pg.on("GET", "/rest/v1/projects", { body: [] });
    pg.on("GET", "/rest/v1/accounts", { body: [] });
    await expectError(await projectsRoute.GET(), 500, "internal");
  });
});

describe("POST /api/projects", () => {
  it("201: makes sure the account exists, then calls create_project as the server with the plan's limit", async () => {
    account("free");
    rpcCreates();

    const res = await post({ name: "  My site  " });
    expect(res.status).toBe(201);
    const { project: created } = (await res.json()) as { project: Project & { owner_id?: string } };
    expect(created.name).toBe("My site");
    expect(publicKeySchema.safeParse(created.public_key).success).toBe(true);
    expect(created).not.toHaveProperty("owner_id");

    const [upsert] = pg.to("/rest/v1/accounts", "POST");
    expect(upsert?.body).toEqual({ clerk_user_id: "user_a" });

    const [rpc] = pg.to("/rest/v1/rpc/create_project");
    expect(rpc?.headers.get("apikey")).toBe(SECRET);
    expect(rpc?.body).toEqual({
      p_owner_id: "user_a",
      p_name: "My site",
      p_public_key: created.public_key,
      p_max_projects: 1,
    });
    // The account upsert is the service client's; the plan read is the owner client's (RLS).
    expect(upsert?.headers.get("apikey")).toBe(SECRET);
    expectOwnerClient("/rest/v1/accounts", "user_a", "GET");
    expect(pg.to("/rest/v1/accounts", "GET")[0]?.params.has("clerk_user_id")).toBe(false);
  });

  it("Pro passes the Pro limit", async () => {
    account("pro");
    rpcCreates();
    expect((await post({ name: "Site" })).status).toBe(201);
    expect(pg.to("/rest/v1/rpc/create_project")[0]?.body).toMatchObject({ p_max_projects: 5 });
  });

  it("Free: first POST 201, second → 403 plan_limit", async () => {
    account("free");
    let created = 0;
    pg.on("POST", "/rest/v1/rpc/create_project", (req) => {
      if (created >= 1) return pgError("KV002", "project_limit: the plan allows 1 project(s)");
      created++;
      const args = req.body as { p_name: string; p_public_key: string };
      return { body: project(ID, args.p_name, args.p_public_key) };
    });

    expect((await post({ name: "First" })).status).toBe(201);
    await expectError(await post({ name: "Second" }), 403, "plan_limit");
  });

  it("key collision: retries once with a new key", async () => {
    account("pro");
    let calls = 0;
    pg.on("POST", "/rest/v1/rpc/create_project", (req) => {
      calls++;
      if (calls === 1)
        return pgError("23505", "duplicate key value violates unique constraint", 409);
      const args = req.body as { p_name: string; p_public_key: string };
      return { body: project(ID, args.p_name, args.p_public_key) };
    });

    const res = await post({ name: "Site" });
    expect(res.status).toBe(201);
    const keys = pg
      .to("/rest/v1/rpc/create_project")
      .map((r) => (r.body as { p_public_key: string }).p_public_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(((await res.json()) as { project: Project }).project.public_key).toBe(keys[1]);
  });

  it("two collisions in a row → 500, no third try", async () => {
    account("pro");
    pg.on("POST", "/rest/v1/rpc/create_project", pgError("23505", "duplicate key", 409));
    await expectError(await post({ name: "Site" }), 500, "internal");
    expect(pg.to("/rest/v1/rpc/create_project")).toHaveLength(2);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a blank name", { name: "   " }],
    ["a name over 80 chars", { name: "x".repeat(81) }],
    ["no name", {}],
    ["a plan in the body", { name: "Site", plan: "pro" }],
    ["an owner in the body", { name: "Site", owner_id: "user_b" }],
    ["not JSON", undefined],
  ])("%s → 400 invalid_input, no database call", async (_, body) => {
    const res =
      body === undefined
        ? await projectsRoute.POST(
            new Request("https://kivo.test/api/projects", { method: "POST", body: "{" }),
          )
        : await post(body);
    await expectError(res, 400, "invalid_input");
    expect(pg.requests).toHaveLength(0);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("renames with the owner client (name only) and returns the project", async () => {
    pg.on("PATCH", "/rest/v1/projects", { body: [project(ID, "New name")] });

    const res = await patch(ID, { name: " New name " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project: project(ID, "New name") });

    const [req] = pg.to("/rest/v1/projects", "PATCH");
    expect(req?.body).toEqual({ name: "New name" });
    expect(req?.params.get("id")).toBe(`eq.${ID}`);
    expect(req?.params.has("owner_id")).toBe(false);
    expectOwnerClient("/rest/v1/projects");
  });

  it("another owner's project (RLS finds no row) → 404", async () => {
    pg.on("PATCH", "/rest/v1/projects", { body: [] });
    await expectError(await patch(OTHER_ID, { name: "Mine now" }), 404, "not_found");
  });

  it.each([
    ["a bad name", ID, { name: "" }],
    ["an extra field", ID, { name: "Ok", public_key: "pk_test_abcdefgh" }],
  ])("%s → 400", async (_, id, body) => {
    await expectError(await patch(id, body), 400, "invalid_input");
    expect(pg.requests).toHaveLength(0);
  });

  it("a non-uuid id → 404, no database call", async () => {
    await expectError(await patch("not-a-uuid", { name: "Ok" }), 404, "not_found");
    expect(pg.requests).toHaveLength(0);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes with the owner client → { ok: true }", async () => {
    pg.on("DELETE", "/rest/v1/projects", { body: [{ id: ID }] });

    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const [req] = pg.to("/rest/v1/projects", "DELETE");
    expect(req?.params.get("id")).toBe(`eq.${ID}`);
    expect(req?.params.has("owner_id")).toBe(false);
    expectOwnerClient("/rest/v1/projects");
  });

  it("another owner's project (RLS deletes nothing) → 404", async () => {
    pg.on("DELETE", "/rest/v1/projects", { body: [] });
    await expectError(await del(OTHER_ID), 404, "not_found");
  });

  it("database error → 500 without the error text", async () => {
    pg.on("DELETE", "/rest/v1/projects", pgError("XX000", "db.secret-host down", 500));
    const res = await del(ID);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret-host");
  });
});
