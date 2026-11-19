"use client";

import { useId, type ReactNode } from "react";
import { GlassPanel } from "../ui/glass-panel";

export type DialogProps = {
  title: string;
  description?: ReactNode;
  /** Escape and a click on the backdrop call it. */
  onClose: () => void;
  children: ReactNode;
};

/** A small modal: a raised glass panel over a blurred backdrop. Put `autoFocus` on its first control. */
export function Dialog({ title, description, onClose, children }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-wash-strong p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <GlassPanel
        surface="raised"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="flex w-full max-w-md flex-col gap-4 p-6"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
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
    </div>
  );
}
