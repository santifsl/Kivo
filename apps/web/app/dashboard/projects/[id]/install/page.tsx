import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { buildInstallSnippet, resolveAppOrigin } from "@/components/install/install-snippet";
import { InstallView } from "@/components/install/install-view";
import { loadOwnedProject } from "@/components/projects/load-owned-project";

export default async function InstallPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await auth.protect();
  // Owner client + RLS: an unknown or not-owned id is a 404.
  const project = await loadOwnedProject((await params).id);

  const origin = resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL, await headers());
  if (!origin) throw new Error("Could not work out the app's URL for the install code.");

  return (
    <InstallView projectId={project.id} snippet={buildInstallSnippet(origin, project.public_key)} />
  );
}
