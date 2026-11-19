"use client";

import { useReducer } from "react";
import type { Plan, Project } from "@kivo/shared";
import { createProjectRequest, deleteProjectRequest, renameProjectRequest } from "./projects-api";
import { ProjectsScreen, type ProjectsHandlers } from "./projects-screen";
import { initialProjectsState, projectsReducer } from "./projects-state";

/**
 * The Projects screen with its state. The list and plan come from the server
 * render (owner client, RLS); create, rename and delete call the API and
 * update the list from its response.
 */
export function ProjectsView({ projects, plan }: { projects: Project[]; plan: Plan }) {
  const [state, dispatch] = useReducer(projectsReducer, initialProjectsState(projects, plan));

  const handlers: ProjectsHandlers = {
    onDraftChange: (name) => dispatch({ type: "draftChanged", name }),
    onCreate: async () => {
      if (state.pending || state.draft.trim() === "") return;
      dispatch({ type: "createStarted" });
      const result = await createProjectRequest(state.draft.trim());
      dispatch(
        result.ok
          ? { type: "createSucceeded", project: result.data.project }
          : { type: "createFailed", error: result.error },
      );
    },
    onRenameOpen: (project) => dispatch({ type: "renameOpened", project }),
    onRenameDraftChange: (name) => dispatch({ type: "renameDraftChanged", name }),
    onRenameSubmit: async () => {
      const { dialog } = state;
      if (state.pending || dialog?.kind !== "rename" || dialog.name.trim() === "") return;
      dispatch({ type: "dialogStarted" });
      const result = await renameProjectRequest(dialog.project.id, dialog.name.trim());
      dispatch(
        result.ok
          ? { type: "renameSucceeded", project: result.data.project }
          : { type: "dialogFailed", error: result.error },
      );
    },
    onDeleteOpen: (project) => dispatch({ type: "deleteOpened", project }),
    // Only the confirm button in the dialog deletes.
    onDeleteConfirm: async () => {
      const { dialog } = state;
      if (state.pending || dialog?.kind !== "delete") return;
      dispatch({ type: "dialogStarted" });
      const result = await deleteProjectRequest(dialog.project.id);
      dispatch(
        result.ok ? { type: "deleteSucceeded", id: dialog.project.id } : { type: "dialogFailed", error: result.error },
      );
    },
    onDialogClose: () => dispatch({ type: "dialogClosed" }),
  };

  return <ProjectsScreen state={state} handlers={handlers} />;
}
