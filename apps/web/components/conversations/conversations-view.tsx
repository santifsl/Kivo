import type { GetConversationResponse, ListConversationsResponse } from "@kivo/shared";
import Link from "next/link";
import { CONVERSATIONS_TAB, projectTabHref } from "../projects/project-tabs";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { GlassPanel } from "../ui/glass-panel";
import { ConversationTime } from "./conversation-time";
import { RefreshButton } from "./refresh-button";

export function ConversationsView({
  projectId,
  conversations,
}: ListConversationsResponse & { projectId: string }) {
  const listHref = projectTabHref(projectId, CONVERSATIONS_TAB);

  return (
    <GlassPanel as="section" aria-labelledby="conversations-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-6">
        <h2 id="conversations-heading" className="text-lg font-semibold text-ink">
          Conversations
        </h2>
        <RefreshButton />
      </div>
      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Chats from this project's widget will appear here after you refresh."
        />
      ) : (
        <ul className="divide-y divide-line">
          {conversations.map(({ id, created_at, preview, message_count }) => (
            <li key={id}>
              <Link
                href={`${listHref}/${encodeURIComponent(id)}`}
                prefetch={false}
                className="flex flex-col gap-2 px-4 py-4 text-ink hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:px-6"
              >
                <p className="ph-no-capture text-sm font-medium wrap-anywhere whitespace-pre-wrap">
                  {preview || "No visitor message"}
                </p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>
                    {message_count} {message_count === 1 ? "message" : "messages"}
                  </span>
                  <ConversationTime timestamp={created_at} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

export function ConversationView({ conversation, messages }: GetConversationResponse) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href={projectTabHref(conversation.project_id, CONVERSATIONS_TAB)}
        className="w-fit text-sm text-ink-muted hover:text-ink"
      >
        ← Back to conversations
      </Link>
      <GlassPanel as="section" aria-labelledby="conversation-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-6">
          <div>
            <h2 id="conversation-heading" className="text-lg font-semibold text-ink">
              Conversation
            </h2>
            <p className="text-xs text-ink-muted">
              <ConversationTime timestamp={conversation.created_at} />
            </p>
          </div>
          <RefreshButton />
        </div>
        {messages.length === 0 ? (
          <EmptyState title="No messages yet" />
        ) : (
          <ol className="flex flex-col gap-4 p-4 sm:p-6">
            {messages.map(({ id, role, body, created_at }) => (
              <li
                key={id}
                className={cn(
                  "w-fit max-w-[90%] min-w-0 rounded-lg border border-line px-4 py-3 sm:max-w-[75%]",
                  role === "bot" ? "self-end bg-wash-strong" : "self-start bg-wash",
                )}
              >
                <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="font-semibold text-ink">
                    {role === "visitor" ? "Visitor" : "Bot"}
                  </span>
                  <ConversationTime timestamp={created_at} />
                </div>
                <p className="ph-no-capture text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-ink">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </GlassPanel>
    </div>
  );
}
