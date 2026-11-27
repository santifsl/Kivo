import Link from "next/link";
import { cn } from "../ui/cn";
import type { NavItem } from "./nav";
import { NAV_ICONS } from "./nav-icon";

export type NavLinksProps = {
  items: readonly NavItem[];
  activeHref: string | null;
  /** Called after a link is clicked (the mobile sheet closes itself). */
  onNavigate?: () => void;
};

/** Presentational nav list. The active item gets a soft fill, a terracotta indicator and `aria-current`. */
export function NavLinks({ items, activeHref, onNavigate }: NavLinksProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = NAV_ICONS[item.icon];
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                active ? "bg-wash-strong font-medium text-ink" : "text-ink-muted hover:bg-wash hover:text-ink",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  data-testid="nav-indicator"
                  className="absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full bg-brand"
                />
              ) : null}
              <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
