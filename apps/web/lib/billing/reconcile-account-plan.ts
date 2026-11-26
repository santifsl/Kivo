import "server-only";
import { ensureAccount } from "../accounts/ensure-account";
import { createServiceClient } from "../supabase/service";
import { getPersonalBillingPlan } from "./clerk-subscription";

/** Returns true only when this delivery changes the account from Free to Pro. */
export async function reconcileAccountPlan(ownerId: string): Promise<boolean> {
  const client = createServiceClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: account, error: readError } = await client
      .from("accounts")
      .select("plan, billing_revision")
      .eq("clerk_user_id", ownerId)
      .maybeSingle();
    if (readError) throw new Error(`Could not read billing account: ${readError.message}`);

    // Read Clerk after reading the revision so a conflict forces a fresh subscription lookup.
    const plan = await getPersonalBillingPlan(ownerId);
    if (!account) {
      if (plan === "free") return false;
      await ensureAccount(ownerId, client);
      continue;
    }

    // Advance the revision even if the plan stays the same. An older reconciliation
    // may still be holding a Clerk snapshot that would change today's plan.
    const { data, error: writeError } = await client
      .from("accounts")
      .update({ plan, billing_revision: account.billing_revision + 1 })
      .eq("clerk_user_id", ownerId)
      .eq("billing_revision", account.billing_revision)
      .select("clerk_user_id");
    if (writeError) throw new Error(`Could not sync billing account: ${writeError.message}`);
    if (data?.length) return account.plan === "free" && plan === "pro";
  }

  throw new Error("Concurrent billing updates prevented reconciliation.");
}
