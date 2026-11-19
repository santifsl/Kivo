import { publicKeySchema } from "@kivo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest } from "./fake-postgrest";
import { generatePublicKey } from "./public-key";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_a", getToken: async () => "token_user_a" }),
}));

const { getOwnedProject } = await import("./projects");
const { createOwnerClient } = await import("../supabase/owner");

describe("generatePublicKey", () => {
  it("is pk_ + 32 base64url chars and passes publicKeySchema", () => {
    for (let i = 0; i < 200; i++) {
      const key = generatePublicKey();
      expect(key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
      expect(publicKeySchema.safeParse(key).success).toBe(true);
    }
  });

  it("doesn't repeat", () => {
    const keys = new Set(Array.from({ length: 1000 }, generatePublicKey));
    expect(keys.size).toBe(1000);
  });
});

describe("getOwnedProject", () => {
  const ID = "6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
  let pg: ReturnType<typeof fakePostgrest>;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_123");
    pg = fakePostgrest();
    vi.stubGlobal("fetch", pg.fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads by id only with the owner client; RLS does the owner check", async () => {
    const row = {
      id: ID,
      name: "Site",
      public_key: "pk_test_abcdefgh",
      messages_used: 0,
      period_start: "2026-11-19T00:00:00+00:00",
      created_at: "2026-11-19T00:00:00+00:00",
    };
    pg.on("GET", "/rest/v1/projects", { body: [row] });

    await expect(getOwnedProject(await createOwnerClient(), ID)).resolves.toEqual(row);
    const [req] = pg.to("/rest/v1/projects");
    expect([...(req?.params.keys() ?? [])].sort()).toEqual(["id", "select"]);
    expect(req?.headers.get("authorization")).toBe("Bearer token_user_a");
  });

  it("not owned (no row under RLS) → null", async () => {
    pg.on("GET", "/rest/v1/projects", { body: [] });
    await expect(getOwnedProject(await createOwnerClient(), ID)).resolves.toBeNull();
  });
});
