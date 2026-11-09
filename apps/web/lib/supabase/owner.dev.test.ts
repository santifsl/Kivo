import { describe, expect, it, vi } from "vitest";
import type * as ClerkServer from "@clerk/nextjs/server";

// Live check against the Supabase dev project: a Clerk session token, sent by
// the owner client, is accepted by Supabase's Clerk third-party auth and RLS
// runs as `authenticated`. Skipped unless KIVO_DEV_CHECKS=1 and the keys are
// set, so CI never runs it. Run with:
//   KIVO_DEV_CHECKS=1 pnpm --filter @kivo/web exec vitest run lib/supabase/owner.dev.test.ts

vi.mock("server-only", () => ({}));

// The owner client reads the session through Clerk's auth(); point it at a
// session minted for a test user. Everything else in Clerk stays real.
const session: { userId: string | null; token: string | null } = { userId: null, token: null };
vi.mock("@clerk/nextjs/server", async (importOriginal) => ({
  ...(await importOriginal<typeof ClerkServer>()),
  auth: async () => ({ userId: session.userId, getToken: async () => session.token }),
}));

const TEST_EMAIL = "kivo-dev-check+clerk_test@example.com";

const enabled =
  process.env.KIVO_DEV_CHECKS === "1" &&
  Boolean(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

describe.skipIf(!enabled)("owner client on the Supabase dev project", () => {
  it("selects from accounts with a Clerk session token, without an auth error", async () => {
    const { createClerkClient } = await import("@clerk/nextjs/server");
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    const existing = await clerk.users.getUserList({ emailAddress: [TEST_EMAIL] });
    const user =
      existing.data[0] ??
      (await clerk.users.createUser({ emailAddress: [TEST_EMAIL], skipPasswordRequirement: true }));
    const created = await clerk.sessions.createSession({ userId: user.id });
    try {
      const { jwt } = await clerk.sessions.getToken(created.id);
      session.userId = user.id;
      session.token = jwt;

      const { createOwnerClient } = await import("./owner");
      const owner = await createOwnerClient();
      const { data, error, status } = await owner.from("accounts").select("clerk_user_id, plan");

      console.info("dev check:", { status, rows: data?.length, error: error?.message ?? null });
      expect(error).toBeNull();
      expect(status).toBe(200);
      expect(data?.length).toBeLessThanOrEqual(1);
      for (const row of data ?? []) expect(row.clerk_user_id).toBe(user.id);
    } finally {
      await clerk.sessions.revokeSession(created.id);
    }
  }, 30_000);
});
