"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PROJECTS_HREF } from "./nav";
import { Sidebar, type SidebarProps } from "./sidebar";
import { ThemedMark } from "./themed-logo";

const SHEET_ID = "dashboard-mobile-sheet";

/** Below `md`: a top bar with the mark and a menu button that opens the sidebar as a sheet. */
export function MobileNav({ projects, plan }: Omit<SidebarProps, "onNavigate">) {
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <div className="flex h-14 items-center justify-between gap-2">
        <Link
          href={PROJECTS_HREF}
          aria-label="Projects"
          className="rounded-md p-1 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <ThemedMark size={28} />
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls={SHEET_ID}
          onClick={() => setOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            id={SHEET_ID}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative flex h-full w-80 max-w-[85vw] flex-col border-r border-line bg-canvas p-4 shadow-glass-lg"
          >
            <button
              ref={closeButton}
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 z-10 inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
            <Sidebar projects={projects} plan={plan} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
