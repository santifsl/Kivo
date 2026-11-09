import type { ReactNode } from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div aria-hidden="true" className="size-12 rounded-lg border border-line bg-wash" />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
