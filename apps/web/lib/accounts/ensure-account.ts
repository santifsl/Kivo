import "server-only";
import { createServiceClient, type ServiceClient } from "../supabase/service";

/**
 * Makes sure the signed-in Clerk user has an `accounts` row (docs/project.md
 * §6.2). One statement: `INSERT … ON CONFLICT (clerk_user_id) DO NOTHING`.
 *
 * - `userId` must come from Clerk's `auth()` on the server, never from the request.
 * - Never sends `plan`: the column default makes new rows `free`, and an
 *   existing row (e.g. Pro, kept in sync by the Clerk webhook) is left as is.
 * - Idempotent, so it's safe to call on every dashboard render.
 *
 * Uses the service client because owners can't insert into `accounts` (§7).
 */
export async function ensureAccount(
  userId: string,
  client: ServiceClient = createServiceClient(),
): Promise<void> {
  if (!userId) throw new Error("ensureAccount needs a Clerk user ID.");

  const { error } = await client
    .from("accounts")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id", ignoreDuplicates: true });

  if (error) throw new Error(`Couldn't create the account row: ${error.message}`);
}
