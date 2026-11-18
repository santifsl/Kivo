import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@kivo/db";
import { requireEnv } from "./env";

export type ServiceClient = SupabaseClient<Database>;

/**
 * Supabase client with the secret key: bypasses RLS and can do everything.
 *
 * WARNING: use it only after the route has checked ownership and plan on the
 * server (e.g. `getOwnedProject`), or in system routes (Clerk webhook,
 * knowledge processing, public widget routes resolved by `public_key`). Never
 * use it for owner reads with a manual owner filter; use `createOwnerClient()`
 * so RLS applies (docs/project.md §9 "Tenant leak").
 *
 * This is the only file that reads SUPABASE_SECRET_KEY (a test enforces it).
 */
export function createServiceClient(): ServiceClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
