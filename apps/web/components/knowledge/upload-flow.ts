import {
  createUploadUrlRequest,
  deleteSourceRequest,
  finalizeUploadRequest,
  uploadToSignedUrl,
} from "./knowledge-api";
import { checkFile } from "./knowledge-rules";
import type { KnowledgeAction } from "./knowledge-state";

// The upload steps, separate from React so tests can run them with fakes.

export interface UploadApi {
  createUploadUrl: typeof createUploadUrlRequest;
  upload: typeof uploadToSignedUrl;
  finalize: typeof finalizeUploadRequest;
  deleteSource: typeof deleteSourceRequest;
}

const DEFAULT_API: UploadApi = {
  createUploadUrl: createUploadUrlRequest,
  upload: uploadToSignedUrl,
  finalize: finalizeUploadRequest,
  deleteSource: deleteSourceRequest,
};

/**
 * Check in the browser → upload-url (reserves the source) → PUT straight to
 * Storage → finalize. Reports each step through `dispatch`. A file the
 * browser refuses never reaches the server. If the PUT fails, try to delete
 * the reservation and let the owner retry cleanup if it fails. A refusal at
 * finalize shows the server's message (the server already deleted the file).
 */
export async function uploadFile(
  projectId: string,
  file: File,
  dispatch: (action: KnowledgeAction) => void,
  api: UploadApi = DEFAULT_API,
): Promise<void> {
  const checked = checkFile(file);
  if ("error" in checked) {
    dispatch({ type: "fileRejected", message: checked.error });
    return;
  }
  dispatch({ type: "uploadStarted", fileName: file.name });

  const reserved = await api.createUploadUrl(projectId, {
    title: checked.title,
    fileName: file.name,
    fileSize: file.size,
    contentType: checked.contentType,
  });
  if (!reserved.ok) {
    dispatch({ type: "uploadFailed", error: reserved.error });
    return;
  }
  const { source, upload } = reserved.data;

  const put = await api.upload(upload.signedUrl, file, checked.contentType, (progress) =>
    dispatch({ type: "uploadProgressed", progress }),
  );
  if (!put.ok) {
    const cleanup = await api.deleteSource(source.id);
    if (cleanup.ok || cleanup.error.code === "not_found") {
      dispatch({ type: "uploadFailed", error: put.error });
    } else {
      dispatch({
        type: "uploadFailed",
        error: {
          code: "internal",
          message: "The upload didn't finish. Delete the unfinished source below and try again.",
        },
        reservedSource: source,
      });
    }
    return;
  }

  dispatch({ type: "uploadFinalizing" });
  const finalized = await api.finalize(projectId, { sourceId: source.id });
  dispatch(
    finalized.ok
      ? { type: "uploadSucceeded", source: finalized.data.source }
      : { type: "uploadFailed", error: finalized.error },
  );
}
