"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { PROJECTS_HREF } from "./nav";
import { Sidebar, type SidebarProps } from "./sidebar";
import { ThemedMark } from "./themed-logo";

const SHEET_ID = "dashboard-mobile-sheet";

/** Below `md`: a top bar with the mark and a menu button that opens the sidebar as a sheet. */
export function MobileNav({ projects, plan }: Omit<SidebarProps, "onNavigate">) {
  const [open, setOpen] = useState(false);
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
          aria-controls={open ? SHEET_ID : undefined}
          onClick={() => setOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-full text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      {open ? (
        <MobileSheet onClose={() => setOpen(false)}>
          <Sidebar projects={projects} plan={plan} onNavigate={() => setOpen(false)} />
        </MobileSheet>
      ) : null}
    </div>
  );
}

/**
 * The sheet, on the native `<dialog>` opened with `showModal()` on mount (like projects/dialog.tsx):
 * the browser keeps focus inside and makes the page behind inert. Escape and a backdrop click close
 * it; on unmount focus goes back to the menu button.
 */
function MobileSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    closeButton.current?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      id={SHEET_ID}
      aria-label="Menu"
      className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-80 max-w-[85vw] border-r border-line bg-canvas p-0 text-ink shadow-glass-lg backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> itself; the content fills it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-full flex-col p-4">
        <button
          ref={closeButton}
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
