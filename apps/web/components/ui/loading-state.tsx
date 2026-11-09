export type LoadingStateProps = {
  /** Read by screen readers; the skeleton itself is hidden from them. */
  label?: string;
  /** Number of skeleton rows. */
  rows?: number;
};

export function LoadingState({ label = "Loading…", rows = 3 }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-40 rounded-sm bg-skeleton" />
          <div className="h-4 w-64 max-w-full rounded-sm bg-skeleton" />
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-glass p-6">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} data-testid="skeleton-row" className="h-4 rounded-sm bg-skeleton" />
          ))}
        </div>
      </div>
    </div>
  );
}
