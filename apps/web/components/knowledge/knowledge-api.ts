import {
  apiErrorSchema,
  type CreateTextSourceRequest,
  type CreateTextSourceResponse,
  type CreateUploadUrlRequest,
  type CreateUploadUrlResponse,
  type DeleteKnowledgeSourceResponse,
  type FinalizeUploadRequest,
  type FinalizeUploadResponse,
} from "@kivo/shared";
import type { ApiFailure, ApiResult } from "../projects/projects-api";

// Browser calls to the owner knowledge API (docs/project.md §8). The session
// cookie goes with them; the server checks ownership and the plan itself.

type Fetch = typeof fetch;

const NETWORK_ERROR: ApiFailure = {
  code: "internal",
  message: "Couldn't reach the server. Check your connection and try again.",
};
const UNKNOWN_ERROR: ApiFailure = {
  code: "internal",
  message: "Something went wrong. Please try again.",
};

async function call<T>(
  fetchImpl: Fetch,
  url: string,
  method: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  const json: unknown = await response.json().catch(() => undefined);
  if (response.ok) return { ok: true, data: json as T };

  // Show the server's message when it sent the standard error body.
  const parsed = apiErrorSchema.safeParse(json);
  return { ok: false, error: parsed.success ? parsed.data.error : UNKNOWN_ERROR };
}

const knowledgeUrl = (projectId: string, step = "") =>
  `/api/projects/${encodeURIComponent(projectId)}/knowledge${step}`;

export function createTextSourceRequest(
  projectId: string,
  body: CreateTextSourceRequest,
  fetchImpl: Fetch = fetch,
) {
  return call<CreateTextSourceResponse>(fetchImpl, knowledgeUrl(projectId), "POST", body);
}

export function createUploadUrlRequest(
  projectId: string,
  body: CreateUploadUrlRequest,
  fetchImpl: Fetch = fetch,
) {
  return call<CreateUploadUrlResponse>(
    fetchImpl,
    knowledgeUrl(projectId, "/upload-url"),
    "POST",
    body,
  );
}

export function finalizeUploadRequest(
  projectId: string,
  body: FinalizeUploadRequest,
  fetchImpl: Fetch = fetch,
) {
  return call<FinalizeUploadResponse>(
    fetchImpl,
    knowledgeUrl(projectId, "/finalize"),
    "POST",
    body,
  );
}

export function deleteSourceRequest(sourceId: string, fetchImpl: Fetch = fetch) {
  return call<DeleteKnowledgeSourceResponse>(
    fetchImpl,
    `/api/knowledge/${encodeURIComponent(sourceId)}`,
    "DELETE",
  );
}

const UPLOAD_ERROR: ApiFailure = {
  code: "internal",
  message: "The upload didn't finish. Check your connection and try again.",
};

/** The XMLHttpRequest parts the upload uses (so tests can pass a fake). */
export type UploadXhr = Pick<
  XMLHttpRequest,
  "open" | "setRequestHeader" | "send" | "status" | "upload" | "onload" | "onerror" | "onabort"
>;

/**
 * PUTs the file straight to Storage with the one-time signed URL from
 * upload-url. The file never passes through our routes (Vercel's 4.5 MB body
 * cap). XMLHttpRequest, because fetch can't report upload progress.
 * `onProgress` gets 0–1.
 */
export function uploadToSignedUrl(
  signedUrl: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  makeXhr: () => UploadXhr = () => new XMLHttpRequest(),
): Promise<ApiResult<null>> {
  return new Promise((resolve) => {
    const xhr = makeXhr();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      resolve(
        xhr.status >= 200 && xhr.status < 300
          ? { ok: true, data: null }
          : { ok: false, error: UPLOAD_ERROR },
      );
    xhr.onerror = () => resolve({ ok: false, error: UPLOAD_ERROR });
    xhr.onabort = () => resolve({ ok: false, error: UPLOAD_ERROR });
    xhr.send(file);
  });
}
