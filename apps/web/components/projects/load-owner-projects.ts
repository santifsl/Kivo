import "server-only";
import { cache } from "react";
import type { Project } from "@kivo/shared";
import { getOwnerSession } from "@/lib/projects/owner-session";
import { listProjects } from "@/lib/projects/projects";

/**
 * The signed-in owner's projects, read with the owner client so RLS only
 * returns their own. Cached per request: the dashboard layout (switcher) and
 * the Projects page share one query.
 */
export const loadOwnerProjects = cache(async (): Promise<Project[]> => {
  const session = await getOwnerSession();
  if (!session) throw new Error("No owner session.");
  return listProjects(session.client);
});
