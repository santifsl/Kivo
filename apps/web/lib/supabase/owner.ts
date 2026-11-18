import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@kivo/db";
import { requireEnv } from "./env";

export type OwnerClient = SupabaseClient<Database>;

/** Thrown by `createOwnerClient()` when the request has no signed-in owner. */
export class NoOwnerSessionError extends Error {
  constructor() {
    super("No Clerk session: the owner client needs a signed-in owner.");
    this.name = "NoOwnerSessionError";
  }
}

/**
 * Supabase client acting as the signed-in owner. Every request carries the
 * owner's Clerk session token, so RLS scopes reads to their own projects
 * (docs/project.md §7). Use it for all owner reads.
 *
 * Server only (route handlers, Server Components, Server Functions). Supabase
 * verifies the token through its Clerk third-party auth integration. No
 * Supabase Auth session, persistence or cookies.
 *
 * Throws `NoOwnerSessionError` when there is no Clerk session, so a request
 * never silently runs as `anon`.
 */
export async function createOwnerClient(): Promise<OwnerClient> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  const { userId, getToken } = await auth();
  if (!userId) throw new NoOwnerSessionError();

  return createClient<Database>(url, key, {
    // Called per request; Clerk returns a cached token until it nears expiry.
    accessToken: async () => {
      const token = await getToken();
      if (!token) throw new NoOwnerSessionError();
      return token;
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
