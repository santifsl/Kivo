import { auth } from "@clerk/nextjs/server";
import { idParamsSchema } from "@kivo/shared";
import { notFound } from "next/navigation";
import { ConversationsView } from "@/components/conversations/conversations-view";
import { listConversations } from "@/lib/conversations/conversations";
import { getOwnerSession } from "@/lib/projects/owner-session";

export default async function ConversationsPage({
  params,
}: PageProps<"/dashboard/projects/[id]/conversations">) {
  await auth.protect();
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const session = await getOwnerSession();
  if (!session) notFound();

  const { id } = parsed.data;
  const conversations = await listConversations(session.client, id);
  if (!conversations) notFound();

  return <ConversationsView projectId={id} conversations={conversations} />;
}
