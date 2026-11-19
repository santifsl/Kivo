import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { idParamsSchema, type Project } from "@kivo/shared";
import { getOwnerSession } from "@/lib/projects/owner-session";
import { getOwnedProject } from "@/lib/projects/projects";

/**
 * The project for a /dashboard/projects/[id] page, read with the owner client
 * so RLS only finds the signed-in owner's projects. A bad id, an unknown id
 * and another owner's id all call `notFound()`. Cached per request, so the
 * layout and its pages share one query.
 */
export const loadOwnedProject = cache(async (id: string): Promise<Project> => {
  const params = idParamsSchema.safeParse({ id });
  if (!params.success) notFound();

  const session = await getOwnerSession();
  if (!session) notFound();

  const project = await getOwnedProject(session.client, params.data.id);
  if (!project) notFound();
  return project;
});
