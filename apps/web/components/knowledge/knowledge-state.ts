import type { KnowledgeSource, Plan } from "@kivo/shared";
import type { ApiFailure } from "../projects/projects-api";
import { isAtSourceLimit } from "./knowledge-rules";

// State of the Knowledge tab. A pure reducer, so the flows (paste, upload,
// the limit, confirm-then-delete) are testable without a browser.

export type UploadProgress =
  | { phase: "idle" }
  | { phase: "uploading"; fileName: string; progress: number }
  | { phase: "finalizing"; fileName: string };

export interface KnowledgeState {
  /** Newest first. */
  sources: KnowledgeSource[];
  plan: Plan;
  pasteTitle: string;
  pasteContent: string;
  pasteError: string | null;
  upload: UploadProgress;
  uploadError: string | null;
  /** The last upload's text was cut to `MAX_EXTRACTED_TEXT_CHARS`. */
  uploadTruncated: boolean;
  /** The server answered 403 plan_limit to the last add. */
  limitFromServer: boolean;
  /** An API call is running. */
  pending: "paste" | "upload" | "delete" | null;
  /** The source the delete dialog asks about. */
  deleting: { source: KnowledgeSource; error: string | null } | null;
}

export type KnowledgeAction =
  | { type: "serverSynced"; sources: KnowledgeSource[]; plan: Plan }
  | { type: "pasteTitleChanged"; title: string }
  | { type: "pasteContentChanged"; content: string }
  | { type: "pasteStarted" }
  | { type: "pasteSucceeded"; source: KnowledgeSource }
  | { type: "pasteFailed"; error: ApiFailure }
  | { type: "fileRejected"; message: string }
  | { type: "uploadStarted"; fileName: string }
  | { type: "uploadProgressed"; progress: number }
  | { type: "uploadFinalizing" }
  | { type: "uploadSucceeded"; source: KnowledgeSource; truncated: boolean }
  | { type: "uploadFailed"; error: ApiFailure; reservedSource?: KnowledgeSource }
  | { type: "deleteOpened"; source: KnowledgeSource }
  | { type: "deleteClosed" }
  | { type: "deleteStarted" }
  | { type: "deleteSucceeded"; id: string }
  | { type: "deleteFailed"; error: ApiFailure };

export function initialKnowledgeState(sources: KnowledgeSource[], plan: Plan): KnowledgeState {
  return {
    sources,
    plan,
    pasteTitle: "",
    pasteContent: "",
    pasteError: null,
    upload: { phase: "idle" },
    uploadError: null,
    uploadTruncated: false,
    limitFromServer: false,
    pending: null,
    deleting: null,
  };
}

/** Adding is off: at the limit by count, or the server said so. */
export function addingDisabled(state: KnowledgeState): boolean {
  return state.limitFromServer || isAtSourceLimit(state.plan, state.sources.length);
}

const withSource = (sources: KnowledgeSource[], source: KnowledgeSource) => [
  source,
  // A refresh may already have brought it in.
  ...sources.filter((s) => s.id !== source.id),
];

export function knowledgeReducer(state: KnowledgeState, action: KnowledgeAction): KnowledgeState {
  switch (action.type) {
    case "serverSynced":
      // Fresh props from a server render (Refresh, or after a change). The
      // server's list and plan win; typed text and an open dialog stay.
      return { ...state, sources: action.sources, plan: action.plan, limitFromServer: false };

    case "pasteTitleChanged":
      return { ...state, pasteTitle: action.title, pasteError: null };
    case "pasteContentChanged":
      return { ...state, pasteContent: action.content, pasteError: null };
    case "pasteStarted":
      return { ...state, pending: "paste", pasteError: null };
    case "pasteSucceeded":
      return {
        ...state,
        pending: null,
        pasteTitle: "",
        pasteContent: "",
        sources: withSource(state.sources, action.source),
      };
    case "pasteFailed":
      if (action.error.code === "plan_limit") {
        // The upgrade message replaces the error text.
        return { ...state, pending: null, limitFromServer: true, pasteError: null };
      }
      return { ...state, pending: null, pasteError: action.error.message };

    case "fileRejected":
      return { ...state, uploadError: action.message, uploadTruncated: false };
    case "uploadStarted":
      return {
        ...state,
        pending: "upload",
        uploadError: null,
        uploadTruncated: false,
        upload: { phase: "uploading", fileName: action.fileName, progress: 0 },
      };
    case "uploadProgressed":
      if (state.upload.phase !== "uploading") return state;
      return {
        ...state,
        upload: { ...state.upload, progress: Math.min(1, Math.max(0, action.progress)) },
      };
    case "uploadFinalizing":
      if (state.upload.phase !== "uploading") return state;
      return { ...state, upload: { phase: "finalizing", fileName: state.upload.fileName } };
    case "uploadSucceeded":
      return {
        ...state,
        pending: null,
        upload: { phase: "idle" },
        uploadTruncated: action.truncated,
        sources: withSource(state.sources, action.source),
      };
    case "uploadFailed":
      if (action.error.code === "plan_limit") {
        return {
          ...state,
          pending: null,
          upload: { phase: "idle" },
          limitFromServer: true,
          uploadError: null,
        };
      }
      return {
        ...state,
        pending: null,
        upload: { phase: "idle" },
        uploadError: action.error.message,
        sources: action.reservedSource
          ? withSource(state.sources, action.reservedSource)
          : state.sources,
      };

    case "deleteOpened":
      return { ...state, deleting: { source: action.source, error: null } };
    case "deleteClosed":
      // Can't close while the request runs: its result would land on a closed dialog.
      return state.pending === "delete" ? state : { ...state, deleting: null };
    case "deleteStarted":
      return state.deleting
        ? { ...state, pending: "delete", deleting: { ...state.deleting, error: null } }
        : state;
    case "deleteSucceeded":
      return {
        ...state,
        pending: null,
        deleting: null,
        limitFromServer: false,
        sources: state.sources.filter((s) => s.id !== action.id),
      };
    case "deleteFailed":
      return state.deleting
        ? { ...state, pending: null, deleting: { ...state.deleting, error: action.error.message } }
        : { ...state, pending: null };
  }
}
