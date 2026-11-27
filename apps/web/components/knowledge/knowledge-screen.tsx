"use client";

import { FileText, FileType, Loader2, type LucideIcon, Plus, TextQuote, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  KNOWLEDGE_TITLE_MAX_LENGTH,
  type KnowledgeSource,
  MAX_TEXT_SOURCE_LENGTH,
} from "@kivo/shared";
import { formatProjectDate } from "../projects/format-date";
import { Dialog } from "../projects/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { FIELD_CLASSES } from "../ui/input";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-3xl leading-display tracking-display text-ink">Knowledge</h2>
          <p className="text-sm text-ink-muted" data-testid="source-count">
            {sourceCountLabel(state.plan, state.sources.length)}. Your bot answers only from these.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handlers.onRefresh} loading={refreshing}>
            Refresh
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              const field = document.getElementById(PASTE_TITLE_ID);
              field?.scrollIntoView({ block: "center", behavior: "smooth" });
              field?.focus({ preventScroll: true });
            }}
          >
            Add knowledge
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          </Button>
        </div>
      </div>

      {disabled ? <LimitNotice state={state} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PasteForm state={state} handlers={handlers} disabled={disabled} />
        <UploadForm state={state} handlers={handlers} disabled={disabled} />
      </div>

      <Card as="section" aria-label="Sources" className="overflow-hidden">
        {state.sources.length === 0 ? (
          <EmptyState
            icon={FileText}
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
      </Card>

      <DeleteDialog state={state} handlers={handlers} />
    </>
  );
}

function LimitNotice({ state }: { state: KnowledgeState }) {
  return (
    <Card as="section" aria-label="Source limit" className="p-4">
      <p role="status" data-testid="source-limit" className="text-sm text-ink-muted">
        {sourceLimitMessage(state.plan)}{" "}
        {state.plan === "free" ? (
          <Link href={BILLING_HREF} className="font-medium text-ink underline decoration-brand underline-offset-2">
            Upgrade to Pro
          </Link>
        ) : null}
      </p>
    </Card>
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
    <Card as="section" aria-label="Paste text" className="p-5 sm:p-6">
      <form
        className="flex h-full flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          handlers.onPasteSubmit();
        }}
      >
        <h3 className="flex items-center gap-2 text-base font-medium text-ink">
          <TextQuote aria-hidden="true" className="size-4 text-ink-muted" strokeWidth={1.75} />
          Paste text
        </h3>
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
          className={cn(FIELD_CLASSES, "min-h-40 flex-1 py-2")}
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
    </Card>
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
  const off = disabled || busy;
  const [dragging, setDragging] = useState(false);
  return (
    <Card as="section" aria-label="Upload a file" className="flex flex-col gap-3 p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-base font-medium text-ink">
        <Upload aria-hidden="true" className="size-4 text-ink-muted" strokeWidth={1.75} />
        Upload a file
      </h3>
      {/* The drop zone grows to fill the card next to the paste form (no dead space). */}
      <label
        htmlFor={FILE_INPUT_ID}
        aria-disabled={off || undefined}
        data-dragging={dragging || undefined}
        className={cn(
          "flex min-h-40 flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-wash px-4 py-8 text-center text-sm text-ink transition-colors",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand hover:bg-wash-strong",
          dragging && "border-brand bg-wash-strong",
          off && "pointer-events-none opacity-50",
        )}
        onDragOver={(event) => {
          if (off) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (!off && file) handlers.onFileChosen(file);
        }}
      >
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink-muted"
        >
          <Upload className="size-4" strokeWidth={1.75} />
        </span>
        <span className="font-medium">Choose a file</span>
        <span className="text-xs text-ink-muted">or drop it here. It uploads as soon as you pick it.</span>
        <span className="text-xs text-ink-muted">PDF, Markdown (.md) or text (.txt), up to 10 MB.</span>
        <input
          id={FILE_INPUT_ID}
          type="file"
          accept={FILE_ACCEPT}
          className="sr-only"
          disabled={off}
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
        <p role="alert" className="text-sm text-danger">
          {state.uploadError}
        </p>
      ) : null}
    </Card>
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
        <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const TYPE_ICONS: Record<KnowledgeSource["type"], LucideIcon> = {
  text: TextQuote,
  pdf: FileText,
  md: FileType,
  txt: FileText,
};

function StatusBadge({ source }: { source: KnowledgeSource }) {
  const label = statusLabel(source.status);
  if (source.status === "ready") {
    return (
      <Badge variant="success" data-status={source.status}>
        {label}
      </Badge>
    );
  }
  if (source.status === "failed") {
    return (
      <span
        data-status={source.status}
        className="inline-flex h-6 items-center gap-1.5 rounded-full bg-danger/10 px-2.5 text-xs font-medium text-danger"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
        {label}
      </span>
    );
  }
  return (
    <span
      data-status={source.status}
      className="inline-flex h-6 items-center gap-1.5 rounded-full bg-wash-strong px-2.5 text-xs font-medium text-ink-muted"
    >
      <Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" strokeWidth={2} />
      {label}
    </span>
  );
}

function SourceRow({ source, handlers }: { source: KnowledgeSource; handlers: KnowledgeHandlers }) {
  const Icon = TYPE_ICONS[source.type];
  return (
    <li className="flex items-start gap-3 px-4 py-4 sm:items-center sm:px-6">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-wash text-ink-muted"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium text-ink">{source.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <StatusBadge source={source} />
          <span>{typeLabel(source.type)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={source.created_at}>{formatProjectDate(source.created_at)}</time>
        </p>
        {source.status === "failed" ? (
          <p className="text-sm text-danger" data-testid="source-failed">
            {FAILED_MESSAGE}
          </p>
        ) : null}
      </div>
      {/* Stays on the row's right edge at every width. */}
      <Button
        variant="ghost"
        className="-mr-2 shrink-0"
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
