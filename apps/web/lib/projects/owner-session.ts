import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createOwnerClient, NoOwnerSessionError, type OwnerClient } from "../supabase/owner";

export interface OwnerSession {
  /** The Clerk user id, from `auth()`: never from the request. */
  userId: string;
  /** Supabase client acting as this owner (RLS applies). */
  client: OwnerClient;
}

/**
 * The signed-in owner, or `null` with no Clerk session. Every owner route
 * handler calls this itself; the proxy is only the first line of defence.
 */
export async function getOwnerSession(): Promise<OwnerSession | null> {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    return { userId, client: await createOwnerClient() };
  } catch (err) {
    if (err instanceof NoOwnerSessionError) return null;
    throw err;
  }
}
