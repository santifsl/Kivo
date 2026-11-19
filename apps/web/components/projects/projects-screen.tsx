"use client";

import Link from "next/link";
import { PROJECT_NAME_MAX_LENGTH, type Project } from "@kivo/shared";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { GlassPanel } from "../ui/glass-panel";
import { Dialog } from "./dialog";
import { formatProjectDate } from "./format-date";
import { BILLING_HREF, isAtProjectLimit, projectLimitMessage } from "./project-limit";
import { projectHref } from "./project-tabs";
import { showsLimitMessage, type ProjectsState } from "./projects-state";

// The Projects screen, drawn from state. ProjectsView owns the state and the
// API calls. Project names are rendered as text only (React escapes them).

export interface ProjectsHandlers {
  onDraftChange: (name: string) => void;
  onCreate: () => void;
  onRenameOpen: (project: Project) => void;
  onRenameDraftChange: (name: string) => void;
  onRenameSubmit: () => void;
  onDeleteOpen: (project: Project) => void;
  onDeleteConfirm: () => void;
  onDialogClose: () => void;
}

const INPUT_CLASSES =
  "h-10 w-full min-w-0 rounded-md border border-line bg-glass-strong px-3 text-sm text-ink placeholder:text-ink-subtle " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";

const DRAFT_INPUT_ID = "new-project-name";

export function ProjectsScreen({ state, handlers }: { state: ProjectsState; handlers: ProjectsHandlers }) {
  const empty = state.projects.length === 0;
  const form = <CreateProjectForm state={state} handlers={handlers} />;
  return (
    <>
      {empty ? (
        <GlassPanel as="section" aria-label="Projects">
          <EmptyState
            title="No projects yet"
            description="Create a project to add your knowledge and get the widget's install code."
            action={form}
          />
        </GlassPanel>
      ) : (
        <>
          <GlassPanel as="section" aria-label="New project" className="p-4 sm:p-6">
            {form}
          </GlassPanel>
          <GlassPanel as="section" aria-label="Projects">
            <ul className="divide-y divide-line">
              {state.projects.map((project) => (
                <ProjectRow key={project.id} project={project} handlers={handlers} />
              ))}
            </ul>
          </GlassPanel>
        </>
      )}
      <ProjectDialog state={state} handlers={handlers} />
    </>
  );
}

function CreateProjectForm({ state, handlers }: { state: ProjectsState; handlers: ProjectsHandlers }) {
  // The count check only disables the form; the server still decides (403 plan_limit).
  const atLimit = isAtProjectLimit(state.plan, state.projects.length);
  const creating = state.pending === "create";
  return (
    <form
      className="flex w-full flex-col gap-3 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        handlers.onCreate();
      }}
    >
      <label htmlFor={DRAFT_INPUT_ID} className="text-sm font-medium text-ink">
        New project
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={DRAFT_INPUT_ID}
          name="name"
          className={INPUT_CLASSES}
          placeholder="My website"
          autoComplete="off"
          maxLength={PROJECT_NAME_MAX_LENGTH}
          value={state.draft}
          disabled={atLimit || creating}
          onChange={(event) => handlers.onDraftChange(event.target.value)}
        />
        <Button type="submit" loading={creating} disabled={atLimit || state.draft.trim() === ""} className="shrink-0">
          Create project
        </Button>
      </div>
      {showsLimitMessage(state) ? <LimitNotice state={state} /> : null}
      {state.createError ? (
        <p role="alert" className="text-sm text-ink">
          {state.createError}
        </p>
      ) : null}
    </form>
  );
}

function LimitNotice({ state }: { state: ProjectsState }) {
  return (
    <p role="status" data-testid="project-limit" className="text-sm text-ink-muted">
      {projectLimitMessage(state.plan)}{" "}
      {state.plan === "free" ? (
        <Link href={BILLING_HREF} className="font-medium text-ink underline underline-offset-2">
          Upgrade to Pro
        </Link>
      ) : null}
    </p>
  );
}

function ProjectRow({ project, handlers }: { project: Project; handlers: ProjectsHandlers }) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={projectHref(project.id)}
          className="truncate font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {project.name}
        </Link>
        <p className="text-xs text-ink-muted">
          Created <time dateTime={project.created_at}>{formatProjectDate(project.created_at)}</time>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" onClick={() => handlers.onRenameOpen(project)} aria-label={`Rename ${project.name}`}>
          Rename
        </Button>
        <Button variant="ghost" onClick={() => handlers.onDeleteOpen(project)} aria-label={`Delete ${project.name}`}>
          Delete
        </Button>
      </div>
    </li>
  );
}

function ProjectDialog({ state, handlers }: { state: ProjectsState; handlers: ProjectsHandlers }) {
  const { dialog } = state;
  if (!dialog) return null;
  const busy = state.pending === "dialog";
  const error = dialog.error ? (
    <p role="alert" className="text-sm text-ink">
      {dialog.error}
    </p>
  ) : null;

  if (dialog.kind === "rename") {
    return (
      <Dialog title="Rename project" onClose={handlers.onDialogClose}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handlers.onRenameSubmit();
          }}
        >
          <label className="flex flex-col gap-2 text-sm font-medium text-ink">
            Name
            <input
              name="name"
              className={INPUT_CLASSES}
              autoComplete="off"
              maxLength={PROJECT_NAME_MAX_LENGTH}
              value={dialog.name}
              disabled={busy}
              onChange={(event) => handlers.onRenameDraftChange(event.target.value)}
            />
          </label>
          {error}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={handlers.onDialogClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={dialog.name.trim() === ""}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Delete project?"
      description={
        <>
          <span className="font-medium text-ink">{dialog.project.name}</span> and everything in it will be deleted.
          Its widget stops working on your website. This can&apos;t be undone.
        </>
      }
      onClose={handlers.onDialogClose}
    >
      {error}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={handlers.onDialogClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handlers.onDeleteConfirm} loading={busy}>
          Delete project
        </Button>
      </div>
    </Dialog>
  );
}
