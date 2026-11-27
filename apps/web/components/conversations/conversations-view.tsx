import type { GetConversationResponse } from "@kivo/shared";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { KivoAppMark } from "../brand/logo";
import { formatRelativeTime } from "../overview/overview";
import { CONVERSATIONS_TAB, projectTabHref } from "../projects/project-tabs";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import type { ConversationRow } from "./conversation-list";
import { ConversationTime, formatConversationTime } from "./conversation-time";
import { RefreshButton } from "./refresh-button";

/** The list's rows, with times formatted once on the server. */
export function toConversationRows(
  projectId: string,
  conversations: readonly { id: string; created_at: string; preview: string; message_count: number }[],
  now: Date = new Date(),
): ConversationRow[] {
  const listHref = projectTabHref(projectId, CONVERSATIONS_TAB);
  return conversations.map(({ id, created_at, preview, message_count }) => ({
    id,
    href: `${listHref}/${encodeURIComponent(id)}`,
    preview,
    message_count,
    created_at,
    relative: formatRelativeTime(created_at, now),
    absolute: formatConversationTime(created_at),
  }));
}

/** The right pane before a thread is picked (only shown from 1024 px). */
export function NoThreadSelected() {
  return (
    <Card>
      <EmptyState
        icon={MessagesSquare}
        title="Pick a conversation"
        description="Choose one on the left to read the whole chat."
      />
    </Card>
  );
}

/**
 * One thread, oldest first, laid out like the widget: the visitor on the
 * right (ink bubble), the bot on the left (grey bubble with the K). Text only.
 */
export function ConversationView({ conversation, messages }: GetConversationResponse) {
  return (
    <Card as="section" aria-labelledby="conversation-heading" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-col gap-1">
          {/* Below 1024 px the list is hidden here, so give a way back. */}
          <Link
            href={projectTabHref(conversation.project_id, CONVERSATIONS_TAB)}
            className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand lg:hidden"
          >
            <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
            Back to conversations
          </Link>
          <h2 id="conversation-heading" className="text-base font-medium text-ink">
            Conversation
          </h2>
          <p className="text-xs text-ink-muted">
            <ConversationTime timestamp={conversation.created_at} />
          </p>
        </div>
        {/* From 1024 px the list's Refresh is on screen; one Refresh at a time. */}
        <div className="lg:hidden">
          <RefreshButton />
        </div>
      </div>
      {messages.length === 0 ? (
        <EmptyState title="No messages yet" />
      ) : (
        <ol className="flex flex-col gap-4 px-4 py-5 sm:px-6">
          {messages.map(({ id, role, body, created_at }) => {
            const visitor = role === "visitor";
            return (
              <li
                key={id}
                data-role={role}
                className={cn("flex max-w-[90%] min-w-0 gap-2.5 sm:max-w-[75%]", visitor ? "self-end" : "self-start")}
              >
                {/* The mark's own CSS sets display, so the theme switch goes on wrappers. */}
                {visitor ? null : (
                  <span aria-hidden="true" data-testid="bot-avatar" className="mt-0.5 shrink-0">
                    <span className="dark:hidden">
                      <KivoAppMark size={28} tone="ink" decorative />
                    </span>
                    <span className="hidden dark:block">
                      <KivoAppMark size={28} tone="paper" decorative />
                    </span>
                  </span>
                )}
                <div className={cn("flex min-w-0 flex-col gap-1", visitor && "items-end")}>
                  <div
                    className={cn(
                      "rounded-lg px-3.5 py-2.5",
                      visitor ? "bg-accent text-accent-ink" : "border border-line bg-wash-strong text-ink",
                    )}
                  >
                    <span className="sr-only">{visitor ? "Visitor" : "Bot"}</span>
                    <p className="ph-no-capture text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">{body}</p>
                  </div>
                  <span className="px-1 text-xs text-ink-subtle">
                    <ConversationTime timestamp={created_at} />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
