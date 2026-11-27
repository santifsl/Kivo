import { APP_NAME, MAX_MESSAGE_LENGTH } from "@kivo/shared";
import { ArrowUp, X } from "lucide-react";
import type { FormEvent, Ref } from "react";
import type { ChatMessage } from "@/lib/embed/chat-state";
import { useFollowBottom } from "../../lib/embed/follow-bottom";
import { K_PATHS } from "../brand/k-mark";
import { cn } from "../ui/cn";

export const FALLBACK_HEADER = "Chat";

/** The avatar's letter: the first character of the header text, uppercased ("C" if empty). */
export function avatarLetter(headerText: string): string {
  const first = Array.from(headerText.trim())[0] ?? Array.from(FALLBACK_HEADER)[0] ?? "";
  return first.toLocaleUpperCase();
}

/** A round avatar with the header's first letter. Decorative: the name is in the header. */
function Avatar({ letter, small = false }: { letter: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="avatar"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink",
        small ? "size-6 text-xs" : "size-9 text-sm",
      )}
    >
      {letter}
    </span>
  );
}

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
  /**
   * The dashboard's Customize preview: the same panel, filling its container instead of the
   * iframe viewport, with the header as text (not the page's h1) and the chat controls out of
   * the tab order. The live widget never sets it.
   */
  preview?: boolean;
};

/** The chat panel inside the widget iframe. Pure view: all state lives in EmbedApp. */
export function PanelView(props: PanelViewProps) {
  const { phase, headerText, onClose, preview = false } = props;
  const Title = preview ? "p" : "h1";
  return (
    <section
      aria-label={headerText}
      data-preview={preview || undefined}
      className={cn("flex flex-col overflow-hidden bg-card", preview ? "h-full" : "h-dvh")}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar letter={avatarLetter(headerText)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Title className="truncate text-sm font-semibold text-ink">{headerText}</Title>
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              aria-hidden="true"
              data-testid="online-dot"
              className="size-1.5 rounded-full bg-success"
            />
            Online
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
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
  headerText,
  messages,
  typing,
  error,
  draft,
  showBadge,
  onDraftChange,
  onSubmit,
  inputRef,
  preview = false,
}: PanelViewProps) {
  // In the preview the controls are only a picture of the widget: not in the tab order.
  const previewOnly = preview ? ({ tabIndex: -1 } as const) : {};
  const canSend = draft.trim().length > 0 && !typing;
  const letter = avatarLetter(headerText);
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
        {messages.map((m) =>
          m.role === "visitor" ? (
            <li
              key={m.id}
              data-role={m.role}
              className="max-w-[85%] self-end rounded-xl rounded-br-sm bg-accent px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-accent-ink"
            >
              <span className="sr-only">You: </span>
              {/* Text only, never HTML (docs/project.md §9 XSS). */}
              {m.text}
            </li>
          ) : (
            <li
              key={m.id}
              data-role={m.role}
              className="flex max-w-[88%] items-end gap-2 self-start"
            >
              <Avatar letter={letter} small />
              <p className="min-w-0 rounded-xl rounded-bl-sm bg-wash-strong px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-ink">
                <span className="sr-only">Bot: </span>
                {/* Text only, never HTML (docs/project.md §9 XSS). */}
                {m.text}
              </p>
            </li>
          ),
        )}
        {typing ? (
          <li data-testid="typing" className="flex items-end gap-2 self-start">
            <Avatar letter={letter} small />
            <span className="flex gap-1 rounded-xl rounded-bl-sm bg-wash-strong px-3.5 py-3">
              <span className="sr-only">Typing…</span>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="size-1.5 animate-pulse rounded-full bg-ink-muted"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
          </li>
        ) : null}
      </ol>
      {error ? (
        <p role="alert" className="px-4 pb-2 text-sm text-ink-muted">
          {error}
        </p>
      ) : null}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Ask a question…"
          aria-label="Message"
          autoComplete="off"
          readOnly={preview}
          {...previewOnly}
          className="h-10 min-w-0 flex-1 rounded-full border border-line-strong bg-card px-4 text-base text-ink placeholder:text-ink-subtle focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink sm:text-sm"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          {...previewOnly}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      </form>
      {showBadge ? (
        <p className="pb-2.5 text-center text-xs text-ink-subtle">
          <a
            href="/"
            target="_blank"
            rel="noopener"
            data-testid="powered-by"
            {...previewOnly}
            className="inline-flex items-center gap-1.5 rounded-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-3 text-ink">
              {/* The Kivo K, without the logo module (no brand fonts in the panel). */}
              {K_PATHS.map((d) => (
                <path key={d} d={d} fill="currentColor" />
              ))}
            </svg>
            Powered by {APP_NAME}
          </a>
        </p>
      ) : null}
    </>
  );
}
