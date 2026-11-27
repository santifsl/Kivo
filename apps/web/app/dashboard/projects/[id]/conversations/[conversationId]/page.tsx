import { auth } from "@clerk/nextjs/server";
import { idSchema } from "@kivo/shared";
import { notFound } from "next/navigation";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ConversationsSplit } from "@/components/conversations/conversations-split";
import { ConversationView } from "@/components/conversations/conversations-view";
import { loadConversationRows } from "@/components/conversations/load-conversation-rows";
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

  // The thread first: RLS hides another owner's, and nothing else is read then.
  const thread = await getConversation(session.client, conversation.data);
  if (thread?.conversation.project_id !== project.data.toLowerCase()) notFound();

  // The list next to it (from 1024 px), also with the owner client.
  const rows = await loadConversationRows(session.client, thread.conversation.project_id);
  if (!rows) notFound();

  return (
    <ConversationsSplit
      open
      empty={rows.length === 0}
      list={<ConversationList rows={rows} selectedId={thread.conversation.id} />}
    >
      <ConversationView {...thread} />
    </ConversationsSplit>
  );
}
