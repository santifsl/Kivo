import Link from "next/link";
import { cn } from "../ui/cn";
import type { NavItem } from "./nav";

export type NavLinksProps = {
  items: readonly NavItem[];
  activeHref: string | null;
  /** Called after a link is clicked (the mobile menu closes itself). */
  onNavigate?: () => void;
};

/** Presentational nav list. The active item gets `aria-current="page"`. */
export function NavLinks({ items, activeHref, onNavigate }: NavLinksProps) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex h-10 items-center rounded-md px-3 text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                active ? "bg-wash-strong font-medium text-ink" : "text-ink-muted hover:bg-wash hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
