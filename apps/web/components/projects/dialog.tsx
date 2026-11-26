"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { GlassPanel } from "../ui/glass-panel";

export type DialogProps = {
  title: string;
  description?: ReactNode;
  /** Escape and a click on the backdrop call it. The parent unmounts the dialog to close it. */
  onClose: () => void;
  children: ReactNode;
};

/**
 * A small modal on the native `<dialog>`, opened with `showModal()` on mount:
 * the browser keeps focus inside, makes the page behind inert, and sends
 * Escape as `cancel`. On unmount it closes and puts focus back on the control
 * that opened it. The first focusable control gets focus when it opens.
 */
export function Dialog({ title, description, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain bg-transparent p-0 backdrop:bg-wash-strong backdrop:backdrop-blur-sm"
      onCancel={(event) => {
        // The parent decides (it ignores Escape while a request runs).
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the <dialog> itself; the panel fills it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <GlassPanel surface="raised" className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm break-words text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </GlassPanel>
    </dialog>
  );
}
