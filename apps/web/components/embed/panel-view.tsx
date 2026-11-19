import { APP_NAME, MAX_MESSAGE_LENGTH } from "@kivo/shared";
import type { FormEvent, Ref } from "react";
import type { ChatMessage } from "@/lib/embed/chat-state";
import { useFollowBottom } from "../../lib/embed/follow-bottom";
import { cn } from "../ui/cn";

export const FALLBACK_HEADER = "Chat";

export type PanelViewProps = {
  phase: "loading" | "error" | "ready";
  headerText: string;
  showBadge: boolean;
  messages: ChatMessage[];
  typing: boolean;
  error: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  onRetry: () => void;
  inputRef?: Ref<HTMLInputElement>;
};

/** The chat panel inside the widget iframe. Pure view: all state lives in EmbedApp. */
export function PanelView(props: PanelViewProps) {
  const { phase, headerText, onClose } = props;
  return (
    <section
      aria-label={headerText}
      className="flex h-dvh flex-col overflow-hidden border border-line bg-glass backdrop-blur-glass"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm bg-ink" />
        <h1 className="min-w-0 flex-1 truncate font-semibold text-ink">{headerText}</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>
      {phase === "loading" ? <PanelLoading /> : null}
      {phase === "error" ? <PanelError onRetry={props.onRetry} /> : null}
      {phase === "ready" ? <PanelChat {...props} /> : null}
    </section>
  );
}

function PanelLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col gap-3 p-4">
      <span className="sr-only">Loading chat…</span>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-3">
        <div className="h-9 w-3/4 rounded-lg bg-skeleton" />
        <div className="h-9 w-1/2 self-end rounded-lg bg-skeleton" />
      </div>
    </div>
  );
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="font-semibold text-ink">Chat is unavailable right now</p>
      <p className="text-sm text-ink-muted">Please try again in a moment.</p>
      <button
        type="button"
        onClick={onRetry}
        className="h-9 rounded-md border border-line bg-wash px-4 text-sm font-medium text-ink transition-colors hover:bg-wash-strong focus-visible:outline-2 focus-visible:outline-ink"
      >
        Try again
      </button>
    </div>
  );
}

function PanelChat({
  messages,
  typing,
  error,
  draft,
  showBadge,
  onDraftChange,
  onSubmit,
  inputRef,
}: PanelViewProps) {
  const canSend = draft.trim().length > 0 && !typing;
  // Follow new messages while the visitor is at the bottom; keep their place if they scrolled up.
  const {
    ref: listRef,
    onScroll: onListScroll,
    follow,
  } = useFollowBottom<HTMLOListElement>(`${messages.length}:${typing}`);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    follow(); // their own message should always come into view
    onSubmit();
  };
  return (
    <>
      <ol
        ref={listRef}
        onScroll={onListScroll}
        aria-live="polite"
        aria-label="Messages"
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !typing ? (
          <li className="m-auto max-w-[16rem] text-center text-sm text-ink-muted">
            Ask a question and we&apos;ll answer right away.
          </li>
        ) : null}
        {messages.map((m) => (
          <li
            key={m.id}
            data-role={m.role}
            className={cn(
              "max-w-[85%] rounded-lg px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
              m.role === "visitor"
                ? "self-end bg-accent text-accent-ink"
                : "self-start border border-line bg-wash text-ink",
            )}
          >
            <span className="sr-only">{m.role === "visitor" ? "You: " : "Bot: "}</span>
            {/* Text only, never HTML (docs/project.md §9 XSS). */}
            {m.text}
          </li>
        ))}
        {typing ? (
          <li
            data-testid="typing"
            className="flex gap-1 self-start rounded-lg border border-line bg-wash px-3.5 py-3"
          >
            <span className="sr-only">Typing…</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="size-1.5 animate-pulse rounded-full bg-ink-muted"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </li>
        ) : null}
      </ol>
      {error ? (
        <p role="alert" className="px-4 pb-2 text-sm text-ink-muted">
          {error}
        </p>
      ) : null}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line px-3 py-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Ask a question…"
          aria-label="Message"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-md border border-line bg-wash px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-ink sm:text-sm"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {showBadge ? (
        <p className="pb-2 text-center text-xs text-ink-subtle">
          <a href="/" target="_blank" rel="noopener" className="hover:text-ink">
            Powered by {APP_NAME}
          </a>
        </p>
      ) : null}
    </>
  );
}
