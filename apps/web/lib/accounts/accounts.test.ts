import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerClient } from "../supabase/owner";
import type { ServiceClient } from "../supabase/service";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null, getToken: async () => null }),
}));

const { after, captureImmediate } = vi.hoisted(() => ({
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  captureImmediate: vi.fn(),
}));
vi.mock("next/server", () => ({ after }));
vi.mock("../posthog/server", () => ({ getPosthogServer: () => ({ captureImmediate }) }));

const { ensureAccount } = await import("./ensure-account");
const { getOwnerPlan } = await import("./get-owner-plan");
const { createServiceClient } = await import("../supabase/service");

/** A service client whose `from().upsert()` records its calls. */
function mockServiceClient(error: { message: string } | null = null) {
  const select = vi
    .fn<
      (columns: string) => Promise<{
        data: { clerk_user_id: string }[] | null;
        error: { message: string } | null;
      }>
    >()
    .mockResolvedValue({ data: null, error });
  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  return { client: { from } as unknown as ServiceClient, from, upsert, select };
}

describe("ensureAccount", () => {
  beforeEach(() => {
    after.mockClear();
    captureImmediate.mockReset();
  });

  it("inserts only clerk_user_id, ignoring duplicates (no plan field)", async () => {
    const { client, from, upsert } = mockServiceClient();
    await ensureAccount("user_123", client);

    expect(from).toHaveBeenCalledWith("accounts");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      { clerk_user_id: "user_123" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
    const [row] = upsert.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(Object.keys(row)).toEqual(["clerk_user_id"]);
    expect(row).not.toHaveProperty("plan");
  });

  it("is safe to call twice: the same one-statement upsert each time, no error", async () => {
    const { client, upsert } = mockServiceClient();
    await expect(ensureAccount("user_123", client)).resolves.toBeUndefined();
    await expect(ensureAccount("user_123", client)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1]).toEqual(upsert.mock.calls[0]);
  });

  it("throws when the insert fails", async () => {
    const { client } = mockServiceClient({ message: "boom" });
    await expect(ensureAccount("user_123", client)).rejects.toThrow("boom");
    expect(after).not.toHaveBeenCalled();
  });

  it("schedules signup only for the insert returned by PostgREST", async () => {
    const { client, select } = mockServiceClient();
    select
      .mockResolvedValueOnce({ data: [{ clerk_user_id: "user_123" }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await Promise.all([ensureAccount("user_123", client), ensureAccount("user_123", client)]);

    expect(select).toHaveBeenCalledWith("clerk_user_id");
    expect(after).toHaveBeenCalledOnce();
    expect(captureImmediate).not.toHaveBeenCalled();
    await after.mock.calls[0]?.[0]();
    expect(captureImmediate).toHaveBeenCalledExactlyOnceWith({
      distinctId: "user_123",
      event: "signed_up",
    });
  });

  it("refuses an empty user ID without touching the database", async () => {
    const { client, from } = mockServiceClient();
    await expect(ensureAccount("", client)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("ensureAccount on the wire (real supabase-js, mocked fetch)", () => {
  // Built at runtime so this file doesn't contain the variable's name (see secret-key.test.ts).
  const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv(SECRET_ENV, "sb_secret_test_456");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends INSERT … ON CONFLICT DO NOTHING with no plan in the body", async () => {
    await ensureAccount("user_123", createServiceClient());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    const body = JSON.parse(String(init?.body)) as unknown;

    expect(init?.method).toBe("POST");
    expect(url.pathname).toBe("/rest/v1/accounts");
    expect(url.searchParams.get("on_conflict")).toBe("clerk_user_id");
    expect(url.searchParams.get("select")).toBe("clerk_user_id");
    expect(headers.get("prefer")).toContain("resolution=ignore-duplicates");
    expect(headers.get("prefer")).not.toContain("merge-duplicates");
    expect(body).toEqual({ clerk_user_id: "user_123" });
  });
});

describe("getOwnerPlan", () => {
  function ownerClient(result: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = vi.fn(async () => result);
    const select = vi.fn(() => ({ maybeSingle }));
    const from = vi.fn(() => ({ select }));
    return { getClient: async () => ({ from }) as unknown as OwnerClient, from, select };
  }

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["free", "pro"] as const)("returns %s from the owner's own row", async (plan) => {
    const { getClient, from, select } = ownerClient({ data: { plan }, error: null });
    await expect(getOwnerPlan(getClient)).resolves.toBe(plan);
    expect(from).toHaveBeenCalledWith("accounts");
    expect(select).toHaveBeenCalledWith("plan");
  });

  it.each([
    ["a query error", { data: null, error: { message: "permission denied" } }],
    ["no row", { data: null, error: null }],
    ["an unknown plan", { data: { plan: "enterprise" }, error: null }],
  ])("returns null and logs on %s", async (_, result) => {
    const { getClient } = ownerClient(result);
    await expect(getOwnerPlan(getClient)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("returns null and logs when there is no owner session", async () => {
    await expect(
      getOwnerPlan(async () => {
        throw new Error("No Clerk session");
      }),
    ).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
