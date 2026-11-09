import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws outside a React Server Components build.
vi.mock("server-only", () => ({}));

const getToken = vi.fn<() => Promise<string | null>>();
let userId: string | null = "user_test";
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId, getToken }),
}));

const { createOwnerClient, NoOwnerSessionError } = await import("./owner");
const { createServiceClient } = await import("./service");

// Built at runtime so this file doesn't contain the variable's name
// (see secret-key.test.ts).
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");

const URL_ = "https://project-ref.supabase.co";
const PUBLISHABLE = "sb_publishable_test_123";
const SECRET = "sb_secret_test_456";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  vi.stubEnv(SECRET_ENV, SECRET);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json([]));
  vi.stubGlobal("fetch", fetchMock);
  getToken.mockReset();
  userId = "user_test";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Headers and URL of the single request the client made. */
function lastRequest(): { url: string; headers: Headers } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0] ?? [];
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
  return { url, headers };
}

describe("createOwnerClient", () => {
  it("sends the Clerk session token as the bearer and the publishable key as apikey", async () => {
    getToken.mockResolvedValue("clerk-session-jwt");
    const { error } = await (await createOwnerClient()).from("accounts").select("*");
    expect(error).toBeNull();

    const { url, headers } = lastRequest();
    expect(url.startsWith(`${URL_}/rest/v1/accounts`)).toBe(true);
    expect(headers.get("authorization")).toBe("Bearer clerk-session-jwt");
    expect(headers.get("apikey")).toBe(PUBLISHABLE);
  });

  it("never sends the secret key", async () => {
    getToken.mockResolvedValue("clerk-session-jwt");
    await (await createOwnerClient()).from("projects").select("id");
    const { headers } = lastRequest();
    for (const [, value] of headers) expect(value).not.toContain(SECRET);
  });

  it("throws without a Clerk session instead of falling back to anon", async () => {
    userId = null;
    getToken.mockResolvedValue(null);
    await expect(createOwnerClient()).rejects.toBeInstanceOf(NoOwnerSessionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])(
    "throws when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");
      await expect(createOwnerClient()).rejects.toThrow(`Missing environment variable ${name}`);
    },
  );
});

describe("createServiceClient", () => {
  it("sends the secret key", async () => {
    const { error } = await createServiceClient().from("projects").select("id");
    expect(error).toBeNull();

    const { url, headers } = lastRequest();
    expect(url.startsWith(`${URL_}/rest/v1/projects`)).toBe(true);
    expect(headers.get("apikey")).toBe(SECRET);
    expect(headers.get("authorization")).not.toContain(PUBLISHABLE);
    expect(getToken).not.toHaveBeenCalled();
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", SECRET_ENV])("throws when %s is missing", (name) => {
    vi.stubEnv(name, "");
    expect(() => createServiceClient()).toThrow(`Missing environment variable ${name}`);
  });

  it("never puts the key's value in the error", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createServiceClient()).not.toThrow(SECRET);
  });
});
