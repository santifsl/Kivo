import { ArrowUp } from "lucide-react";
import { APP_NAME } from "@kivo/shared";
import { KivoAppMark } from "../brand/logo";
import { cn } from "../ui/cn";

/** The example exchange. A shop's own docs would answer this; no sources are shown. */
export const CHAT_MOCK = {
  question: "Do you offer refunds?",
  answer:
    "Yes. You can ask for a full refund within 30 days of purchase. Reply to your order email and we'll take care of it.",
} as const;

function Avatar() {
  return <KivoAppMark size={28} tone="paper" decorative className="shrink-0" />;
}

/**
 * A static picture of the widget in use, for the hero. It's a figure, not a working chat:
 * the "input" is a styled box, so nothing here is focusable or pretends to be interactive.
 */
export function ChatCardMock({ className }: { className?: string }) {
  return (
    <figure
      aria-label="Example: the chat answering a visitor's question"
      className={cn(
        "flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-line bg-glass shadow-glass-lg backdrop-blur-glass",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-ink">{APP_NAME}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span
              aria-hidden="true"
              data-testid="online-dot"
              className="size-1.5 rounded-full bg-success"
            />
            Online
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-5">
        <p className="max-w-[85%] self-end rounded-lg rounded-br-sm bg-accent px-3.5 py-2.5 text-sm text-accent-ink">
          <span className="sr-only">Visitor: </span>
          {CHAT_MOCK.question}
        </p>
        <div className="flex items-end gap-2.5">
          <Avatar />
          <p className="max-w-[85%] rounded-lg rounded-bl-sm border border-line bg-wash px-3.5 py-2.5 text-sm leading-relaxed text-ink">
            <span className="sr-only">{APP_NAME}: </span>
            {CHAT_MOCK.answer}
          </p>
        </div>
      </div>

      <div aria-hidden="true" className="flex items-center gap-2 border-t border-line p-3">
        <span className="flex h-10 flex-1 items-center rounded-full border border-line-strong px-4 text-sm text-ink-subtle">
          Ask a question…
        </span>
        <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-ink">
          <ArrowUp className="size-4" strokeWidth={2} />
        </span>
      </div>
    </figure>
  );
}
