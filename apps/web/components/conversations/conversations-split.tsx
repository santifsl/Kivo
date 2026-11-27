import type { ReactNode } from "react";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";

/**
 * Two panes from 1024 px: the list on the left, the open thread (or a hint) on
 * the right. Below that, one pane at a time: the list, or the thread once one is open.
 */
export function ConversationsSplit({
  list,
  empty,
  open,
  children,
}: {
  list: ReactNode;
  /** A thread is open (the thread page). */
  open: boolean;
  /** No conversations: the list's empty state takes the full width. */
  empty: boolean;
  children: ReactNode;
}) {
  if (empty && !open) return <Card className="overflow-hidden">{list}</Card>;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Card className={cn("overflow-hidden lg:sticky lg:top-6", open ? "hidden lg:block" : "block")}>{list}</Card>
      <div className={cn("min-w-0", open ? "block" : "hidden lg:block")}>{children}</div>
    </div>
  );
}
