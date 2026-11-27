import { MessageSquare, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { RefreshButton } from "./refresh-button";

/** One list row. `relative` and `absolute` are formatted on the server (no hydration drift). */
export interface ConversationRow {
  id: string;
  href: string;
  preview: string;
  message_count: number;
  created_at: string;
  relative: string;
  absolute: string;
}

/**
 * The conversations list: chat icon, first visitor message (as text), message
 * count and relative time. The open thread's row is marked current.
 */
export function ConversationList({
  rows,
  selectedId = null,
}: {
  rows: readonly ConversationRow[];
  /** The open thread, marked current. */
  selectedId?: string | null;
}) {
  const selected = selectedId;
  return (
    <section aria-labelledby="conversations-heading" className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 id="conversations-heading" className="text-base font-medium text-ink">
          Conversations
        </h2>
        <RefreshButton />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Chats from this project's widget will appear here after you refresh."
        />
      ) : (
        <ul className="divide-y divide-line overflow-y-auto">
          {rows.map((row) => {
            const current = row.id === selected;
            return (
              <li key={row.id}>
                <Link
                  href={row.href}
                  prefetch={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative flex gap-3 px-4 py-3.5 text-ink transition-colors sm:px-5",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                    current ? "bg-wash-strong" : "hover:bg-wash",
                  )}
                >
                  {current ? (
                    <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand" />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink-muted"
                  >
                    <MessageSquare className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      className={cn(
                        "ph-no-capture line-clamp-2 text-sm wrap-anywhere",
                        row.preview ? "font-medium text-ink" : "text-ink-subtle",
                      )}
                    >
                      {row.preview || "No visitor message"}
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                      <span>
                        {row.message_count} {row.message_count === 1 ? "message" : "messages"}
                      </span>
                      <time dateTime={row.created_at} title={row.absolute}>
                        {row.relative}
                      </time>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
