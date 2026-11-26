"use client";

import Link from "next/link";
import {
  KNOWLEDGE_TITLE_MAX_LENGTH,
  type KnowledgeSource,
  MAX_TEXT_SOURCE_LENGTH,
} from "@kivo/shared";
import { formatProjectDate } from "../projects/format-date";
import { Dialog } from "../projects/dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { GlassPanel } from "../ui/glass-panel";
import {
  BILLING_HREF,
  FAILED_MESSAGE,
  FILE_ACCEPT,
  sourceCountLabel,
  sourceLimitMessage,
  statusLabel,
  TRUNCATED_MESSAGE,
  typeLabel,
} from "./knowledge-rules";
import { addingDisabled, type KnowledgeState } from "./knowledge-state";

// The Knowledge tab, drawn from state. KnowledgeView owns the state and the
// API calls. Titles render as text only (React escapes them).

export interface KnowledgeHandlers {
  onPasteTitleChange: (title: string) => void;
  onPasteContentChange: (content: string) => void;
  onPasteSubmit: () => void;
  onFileChosen: (file: File) => void;
  onDeleteOpen: (source: KnowledgeSource) => void;
  onDeleteConfirm: () => void;
  onDeleteClose: () => void;
  onRefresh: () => void;
}

const FIELD_CLASSES =
  "w-full min-w-0 rounded-md border border-line bg-glass-strong px-3 text-sm text-ink placeholder:text-ink-subtle " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

export const PASTE_TITLE_ID = "knowledge-paste-title";
export const PASTE_CONTENT_ID = "knowledge-paste-content";
export const FILE_INPUT_ID = "knowledge-file";

export function KnowledgeScreen({
  state,
  handlers,
  refreshing = false,
}: {
  state: KnowledgeState;
  handlers: KnowledgeHandlers;
  refreshing?: boolean;
}) {
  const disabled = addingDisabled(state);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-ink">Knowledge</h2>
          <p className="text-sm text-ink-muted" data-testid="source-count">
            {sourceCountLabel(state.plan, state.sources.length)}. Your bot answers only from these.
          </p>
        </div>
        <Button variant="secondary" onClick={handlers.onRefresh} loading={refreshing}>
          Refresh
        </Button>
      </div>

      {disabled ? <LimitNotice state={state} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PasteForm state={state} handlers={handlers} disabled={disabled} />
        <UploadForm state={state} handlers={handlers} disabled={disabled} />
      </div>

      <GlassPanel as="section" aria-label="Sources">
        {state.sources.length === 0 ? (
          <EmptyState
            title="No knowledge yet"
            description="Paste text or upload a PDF, Markdown or text file. Your bot answers from it."
          />
        ) : (
          <ul className="divide-y divide-line">
            {state.sources.map((source) => (
              <SourceRow key={source.id} source={source} handlers={handlers} />
            ))}
          </ul>
        )}
      </GlassPanel>

      <DeleteDialog state={state} handlers={handlers} />
    </>
  );
}

function LimitNotice({ state }: { state: KnowledgeState }) {
  return (
    <GlassPanel as="section" aria-label="Source limit" className="p-4">
      <p role="status" data-testid="source-limit" className="text-sm text-ink-muted">
        {sourceLimitMessage(state.plan)}{" "}
        {state.plan === "free" ? (
          <Link href={BILLING_HREF} className="font-medium text-ink underline underline-offset-2">
            Upgrade to Pro
          </Link>
        ) : null}
      </p>
    </GlassPanel>
  );
}

function PasteForm({
  state,
  handlers,
  disabled,
}: {
  state: KnowledgeState;
  handlers: KnowledgeHandlers;
  disabled: boolean;
}) {
  const busy = state.pending === "paste";
  const empty = state.pasteTitle.trim() === "" || state.pasteContent.trim() === "";
  return (
    <GlassPanel as="section" aria-label="Paste text" className="p-4 sm:p-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          handlers.onPasteSubmit();
        }}
      >
        <h3 className="text-sm font-semibold text-ink">Paste text</h3>
        <label htmlFor={PASTE_TITLE_ID} className="text-sm font-medium text-ink">
          Title
        </label>
        <input
          id={PASTE_TITLE_ID}
          name="title"
          className={cn(FIELD_CLASSES, "h-10")}
          placeholder="Shipping policy"
          autoComplete="off"
          maxLength={KNOWLEDGE_TITLE_MAX_LENGTH}
          value={state.pasteTitle}
          disabled={disabled || busy}
          onChange={(event) => handlers.onPasteTitleChange(event.target.value)}
        />
        <label htmlFor={PASTE_CONTENT_ID} className="text-sm font-medium text-ink">
          Text
        </label>
        <textarea
          id={PASTE_CONTENT_ID}
          name="content"
          className={cn(FIELD_CLASSES, "min-h-40 py-2")}
          placeholder="We ship to the US and Canada…"
          maxLength={MAX_TEXT_SOURCE_LENGTH}
          value={state.pasteContent}
          disabled={disabled || busy}
          onChange={(event) => handlers.onPasteContentChange(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-subtle">
            {state.pasteContent.length.toLocaleString("en-US")} /{" "}
            {MAX_TEXT_SOURCE_LENGTH.toLocaleString("en-US")} characters
          </span>
          <Button type="submit" loading={busy} disabled={disabled || empty}>
            Add text
          </Button>
        </div>
        {state.pasteError ? (
          <p role="alert" className="text-sm text-ink">
            {state.pasteError}
          </p>
        ) : null}
      </form>
    </GlassPanel>
  );
}

function UploadForm({
  state,
  handlers,
  disabled,
}: {
  state: KnowledgeState;
  handlers: KnowledgeHandlers;
  disabled: boolean;
}) {
  const { upload } = state;
  const busy = state.pending === "upload";
  return (
    <GlassPanel as="section" aria-label="Upload a file" className="flex flex-col gap-3 p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-ink">Upload a file</h3>
      <p className="text-sm text-ink-muted">PDF, Markdown (.md) or text (.txt), up to 10 MB.</p>
      <label
        htmlFor={FILE_INPUT_ID}
        aria-disabled={disabled || busy || undefined}
        className={cn(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line bg-wash px-4 py-6 text-center text-sm text-ink",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink hover:bg-wash-strong",
          (disabled || busy) && "pointer-events-none opacity-50",
        )}
      >
        <span className="font-medium">Choose a file</span>
        <span className="text-xs text-ink-muted">It uploads as soon as you pick it.</span>
        <input
          id={FILE_INPUT_ID}
          type="file"
          accept={FILE_ACCEPT}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear it so picking the same file again fires change.
            event.target.value = "";
            if (file) handlers.onFileChosen(file);
          }}
        />
      </label>
      {upload.phase !== "idle" ? <UploadProgressBar upload={upload} /> : null}
      {state.uploadTruncated ? (
        <p role="status" data-testid="upload-truncated" className="text-sm text-ink-muted">
          {TRUNCATED_MESSAGE}
        </p>
      ) : null}
      {state.uploadError ? (
        <p role="alert" className="text-sm text-ink">
          {state.uploadError}
        </p>
      ) : null}
    </GlassPanel>
  );
}

function UploadProgressBar({
  upload,
}: {
  upload: Exclude<KnowledgeState["upload"], { phase: "idle" }>;
}) {
  const percent = upload.phase === "uploading" ? Math.round(upload.progress * 100) : 100;
  const label = upload.phase === "uploading" ? `Uploading… ${percent}%` : "Checking the file…";
  return (
    <div className="flex flex-col gap-1" data-testid="upload-progress">
      <div className="flex justify-between gap-2 text-xs text-ink-muted">
        <span className="min-w-0 truncate">{upload.fileName}</span>
        <span className="shrink-0">{label}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Uploading ${upload.fileName}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-wash-strong"
      >
        <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ source }: { source: KnowledgeSource }) {
  return (
    <span
      data-status={source.status}
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium",
        source.status === "ready" && "border-accent bg-accent text-accent-ink",
        source.status === "failed" && "border-ink bg-glass-strong text-ink",
        (source.status === "processing" || source.status === "uploading") &&
          "border-line bg-wash text-ink-muted",
      )}
    >
      {statusLabel(source.status)}
    </span>
  );
}

function SourceRow({ source, handlers }: { source: KnowledgeSource; handlers: KnowledgeHandlers }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate font-medium text-ink">{source.title}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <StatusBadge source={source} />
          <span>{typeLabel(source.type)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={source.created_at}>{formatProjectDate(source.created_at)}</time>
        </p>
        {source.status === "failed" ? (
          <p className="text-sm text-ink" data-testid="source-failed">
            {FAILED_MESSAGE}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        className="shrink-0 self-start sm:self-auto"
        onClick={() => handlers.onDeleteOpen(source)}
        aria-label={`Delete ${source.title}`}
      >
        Delete
      </Button>
    </li>
  );
}

function DeleteDialog({ state, handlers }: { state: KnowledgeState; handlers: KnowledgeHandlers }) {
  const { deleting } = state;
  if (!deleting) return null;
  const busy = state.pending === "delete";
  return (
    <Dialog
      title="Delete source?"
      description={
        <>
          <span className="font-medium text-ink">{deleting.source.title}</span> will be deleted.
          Your bot stops answering from it. This can&apos;t be undone.
        </>
      }
      onClose={handlers.onDeleteClose}
    >
      {deleting.error ? (
        <p role="alert" className="text-sm text-ink">
          {deleting.error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handlers.onDeleteClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handlers.onDeleteConfirm} loading={busy}>
          Delete source
        </Button>
      </div>
    </Dialog>
  );
}
