import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  description?: string;
  /** Shown next to the title, e.g. a Badge. */
  badge?: ReactNode;
  /** Buttons on the right (wrap below the title on small screens). */
  actions?: ReactNode;
  /** Above the title, e.g. a "← Projects" link. */
  breadcrumb?: ReactNode;
};

/** Serif page title, with optional badge, description, breadcrumb and actions. */
export function PageHeader({ title, description, badge, actions, breadcrumb }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumb ? (
        <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
          {breadcrumb}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl leading-display tracking-display text-ink sm:text-5xl">
              {title}
            </h1>
            {badge}
          </div>
          {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
