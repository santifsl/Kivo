import type { Plan, Project } from "@kivo/shared";
import { isAtProjectLimit } from "./project-limit";
import type { ApiFailure } from "./projects-api";

// State of the Projects screen. A pure reducer, so the flows (create, the
// limit, rename, confirm-then-delete) are testable without a browser.

export type ProjectsDialog =
  | { kind: "rename"; project: Project; name: string; error: string | null }
  | { kind: "delete"; project: Project; error: string | null }
  | null;

export interface ProjectsState {
  projects: Project[];
  plan: Plan;
  /** The new project's name, as typed. */
  draft: string;
  createError: string | null;
  /** The server answered 403 plan_limit to the last create. */
  limitFromServer: boolean;
  /** An API call is running ("create", or the open dialog's action). */
  pending: "create" | "dialog" | null;
  dialog: ProjectsDialog;
}

export type ProjectsAction =
  | { type: "serverSynced"; projects: Project[]; plan: Plan }
  | { type: "draftChanged"; name: string }
  | { type: "createStarted" }
  | { type: "createSucceeded"; project: Project }
  | { type: "createFailed"; error: ApiFailure }
  | { type: "renameOpened"; project: Project }
  | { type: "renameDraftChanged"; name: string }
  | { type: "deleteOpened"; project: Project }
  | { type: "dialogClosed" }
  | { type: "dialogStarted" }
  | { type: "renameSucceeded"; project: Project }
  | { type: "deleteSucceeded"; id: string }
  | { type: "dialogFailed"; error: ApiFailure };

export function initialProjectsState(projects: Project[], plan: Plan): ProjectsState {
  return { projects, plan, draft: "", createError: null, limitFromServer: false, pending: null, dialog: null };
}

/** Show the upgrade message: at the limit by count, or the server said so. */
export function showsLimitMessage(state: ProjectsState): boolean {
  return state.limitFromServer || isAtProjectLimit(state.plan, state.projects.length);
}

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case "serverSynced":
      // Fresh props from a server render (router.refresh). The server's list and
      // plan win; the typed name, an open dialog and its edits stay.
      return { ...state, projects: action.projects, plan: action.plan, limitFromServer: false };
    case "draftChanged":
      return { ...state, draft: action.name, createError: null };
    case "createStarted":
      return { ...state, pending: "create", createError: null };
    case "createSucceeded":
      return {
        ...state,
        pending: null,
        draft: "",
        // A refresh may already have brought it in.
        projects: [action.project, ...state.projects.filter((p) => p.id !== action.project.id)],
      };
    case "createFailed":
      if (action.error.code === "plan_limit") {
        // The upgrade message replaces the error text.
        return { ...state, pending: null, limitFromServer: true, createError: null };
      }
      return { ...state, pending: null, createError: action.error.message };

    case "renameOpened":
      return { ...state, dialog: { kind: "rename", project: action.project, name: action.project.name, error: null } };
    case "renameDraftChanged":
      if (state.dialog?.kind !== "rename") return state;
      return { ...state, dialog: { ...state.dialog, name: action.name, error: null } };
    case "deleteOpened":
      return { ...state, dialog: { kind: "delete", project: action.project, error: null } };
    case "dialogClosed":
      // Can't close while the request runs: its result would land on a closed dialog.
      return state.pending === "dialog" ? state : { ...state, dialog: null };
    case "dialogStarted":
      return state.dialog ? { ...state, pending: "dialog", dialog: { ...state.dialog, error: null } } : state;
    case "renameSucceeded":
      return {
        ...state,
        pending: null,
        dialog: null,
        projects: state.projects.map((p) => (p.id === action.project.id ? action.project : p)),
      };
    case "deleteSucceeded":
      return {
        ...state,
        pending: null,
        dialog: null,
        limitFromServer: false,
        projects: state.projects.filter((p) => p.id !== action.id),
      };
    case "dialogFailed":
      return state.dialog
        ? { ...state, pending: null, dialog: { ...state.dialog, error: action.error.message } }
        : { ...state, pending: null };
  }
}
