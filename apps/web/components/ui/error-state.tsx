"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "./button";

export type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Shows a retry button when given. */
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Please try again.",
  onRetry,
  retryLabel = "Try again",
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-lg border border-line bg-card text-danger shadow-card"
      >
        <TriangleAlert className="size-5" strokeWidth={1.75} />
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
