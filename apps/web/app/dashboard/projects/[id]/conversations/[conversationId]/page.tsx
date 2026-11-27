import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { idSchema } from "@kivo/shared";
import { notFound } from "next/navigation";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ConversationsSplit } from "@/components/conversations/conversations-split";
import { ConversationView } from "@/components/conversations/conversations-view";
import { loadConversationRows } from "@/components/conversations/load-conversation-rows";
import { getConversation } from "@/lib/conversations/conversations";
import { LoadingState } from "@/components/ui/loading-state";
import { getOwnerSession } from "@/lib/projects/owner-session";
import type { OwnerClient } from "@/lib/supabase/owner";

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

  // The list next to it (from 1024 px) streams in after the thread, so a thread never waits
  // for the project's whole history. It is read only after the checks above passed.
  return (
    <ConversationsSplit
      open
      empty={false}
      list={
        <Suspense fallback={<LoadingState label="Loading conversations…" rows={3} />}>
          <ThreadSideList client={session.client} projectId={thread.conversation.project_id} selectedId={thread.conversation.id} />
        </Suspense>
      }
    >
      <ConversationView {...thread} />
    </ConversationsSplit>
  );
}

async function ThreadSideList({
  client,
  projectId,
  selectedId,
}: {
  client: OwnerClient;
  projectId: string;
  selectedId: string;
}) {
  const rows = await loadConversationRows(client, projectId);
  return <ConversationList rows={rows ?? []} selectedId={selectedId} />;
}
