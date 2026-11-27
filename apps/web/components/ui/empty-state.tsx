import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
  /** A lucide icon for the tile. Defaults to an inbox. */
  icon?: LucideIcon;
};

export function EmptyState({ title, description, action, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-lg border border-line bg-card text-ink-muted shadow-card"
      >
        <Icon data-testid="empty-state-icon" className="size-5" strokeWidth={1.75} />
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
