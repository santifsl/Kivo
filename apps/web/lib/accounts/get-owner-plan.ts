import "server-only";
import { planSchema, type Plan } from "@kivo/shared";
import { createOwnerClient, type OwnerClient } from "../supabase/owner";

/**
 * The signed-in owner's plan, read with the owner client so RLS scopes it to
 * their own row (docs/project.md §9 "Tenant leak"). Returns `null` on any
 * error (no session, no row, a bad value) and logs it on the server.
 */
export async function getOwnerPlan(
  getClient: () => Promise<OwnerClient> = createOwnerClient,
): Promise<Plan | null> {
  try {
    const client = await getClient();
    const { data, error } = await client.from("accounts").select("plan").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("no accounts row for the signed-in owner");

    const plan = planSchema.safeParse(data.plan);
    if (!plan.success) throw new Error("unexpected plan value");
    return plan.data;
  } catch (err) {
    console.error("[accounts] Couldn't read the owner's plan:", err instanceof Error ? err.message : err);
    return null;
  }
}
