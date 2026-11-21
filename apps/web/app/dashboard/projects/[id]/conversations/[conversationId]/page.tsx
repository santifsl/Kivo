import { auth } from "@clerk/nextjs/server";
import { idSchema } from "@kivo/shared";
import { notFound } from "next/navigation";
import { ConversationView } from "@/components/conversations/conversations-view";
import { getConversation } from "@/lib/conversations/conversations";
import { getOwnerSession } from "@/lib/projects/owner-session";

export default async function ConversationPage({
  params,
}: PageProps<"/dashboard/projects/[id]/conversations/[conversationId]">) {
  await auth.protect();
  const { id, conversationId } = await params;
  const project = idSchema.safeParse(id);
  const conversation = idSchema.safeParse(conversationId);
  if (!project.success || !conversation.success) notFound();

  const session = await getOwnerSession();
  if (!session) notFound();

  const thread = await getConversation(session.client, conversation.data);
  if (thread?.conversation.project_id !== project.data.toLowerCase()) notFound();

  return <ConversationView {...thread} />;
}
