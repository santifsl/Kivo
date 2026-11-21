"use client";

import { useRouter } from "next/navigation";
import { useReducer, useState, useTransition } from "react";
import type { KnowledgeSource, Plan } from "@kivo/shared";
import { createTextSourceRequest, deleteSourceRequest } from "./knowledge-api";
import { KnowledgeScreen, type KnowledgeHandlers } from "./knowledge-screen";
import { initialKnowledgeState, knowledgeReducer } from "./knowledge-state";
import { uploadFile } from "./upload-flow";

/**
 * The Knowledge tab with its state. Sources and plan come from the server
 * render (owner client, RLS). Adding and deleting call the API and update
 * the list from its response; Refresh re-renders on the server to pick up
 * new statuses (no realtime, docs/project.md §12).
 */
export function KnowledgeView({
  projectId,
  sources,
  plan,
}: {
  projectId: string;
  sources: KnowledgeSource[];
  plan: Plan;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [state, dispatch] = useReducer(knowledgeReducer, initialKnowledgeState(sources, plan));

  // useReducer only reads its props once. When a refresh brings a new list or
  // plan, take them, keeping typed text.
  // Adjusting state during render: https://react.dev/learn/you-might-not-need-an-effect
  const [synced, setSynced] = useState({ sources, plan });
  if (synced.sources !== sources || synced.plan !== plan) {
    setSynced({ sources, plan });
    dispatch({ type: "serverSynced", sources, plan });
  }

  const refresh = () => startRefresh(() => router.refresh());

  const handlers: KnowledgeHandlers = {
    onPasteTitleChange: (title) => dispatch({ type: "pasteTitleChanged", title }),
    onPasteContentChange: (content) => dispatch({ type: "pasteContentChanged", content }),
    onPasteSubmit: async () => {
      const title = state.pasteTitle.trim();
      const content = state.pasteContent.trim();
      if (state.pending || !title || !content) return;
      dispatch({ type: "pasteStarted" });
      const result = await createTextSourceRequest(projectId, { title, content });
      dispatch(
        result.ok
          ? { type: "pasteSucceeded", source: result.data.source }
          : { type: "pasteFailed", error: result.error },
      );
    },

    onFileChosen: (file) => {
      if (state.pending) return;
      void uploadFile(projectId, file, dispatch);
    },

    onDeleteOpen: (source) => dispatch({ type: "deleteOpened", source }),
    // Only the confirm button in the dialog deletes.
    onDeleteConfirm: async () => {
      const { deleting } = state;
      if (state.pending || !deleting) return;
      dispatch({ type: "deleteStarted" });
      const result = await deleteSourceRequest(deleting.source.id);
      dispatch(
        result.ok
          ? { type: "deleteSucceeded", id: deleting.source.id }
          : { type: "deleteFailed", error: result.error },
      );
    },
    onDeleteClose: () => dispatch({ type: "deleteClosed" }),
    onRefresh: refresh,
  };

  return <KnowledgeScreen state={state} handlers={handlers} refreshing={refreshing} />;
}
