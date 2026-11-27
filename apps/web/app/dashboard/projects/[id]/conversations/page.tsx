import { auth } from "@clerk/nextjs/server";
import { idParamsSchema } from "@kivo/shared";
import { notFound } from "next/navigation";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ConversationsSplit } from "@/components/conversations/conversations-split";
import { NoThreadSelected } from "@/components/conversations/conversations-view";
import { loadConversationRows } from "@/components/conversations/load-conversation-rows";
import { getOwnerSession } from "@/lib/projects/owner-session";

export default async function ConversationsPage({
  params,
}: PageProps<"/dashboard/projects/[id]/conversations">) {
  await auth.protect();
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const session = await getOwnerSession();
  if (!session) notFound();

  const rows = await loadConversationRows(session.client, parsed.data.id);
  if (!rows) notFound();

  return (
    <ConversationsSplit open={false} empty={rows.length === 0} list={<ConversationList rows={rows} />}>
      <NoThreadSelected />
    </ConversationsSplit>
  );
}
