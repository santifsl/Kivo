import {
  apiErrorSchema,
  type ApiErrorCode,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type DeleteProjectResponse,
  type UpdateProjectRequest,
  type UpdateProjectResponse,
} from "@kivo/shared";

// Browser calls to the owner projects API (docs/project.md §8). The session
// cookie goes with them; the server reads the owner and plan itself.

export type ApiFailure = { code: ApiErrorCode; message: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

type Fetch = typeof fetch;

const NETWORK_ERROR: ApiFailure = {
  code: "internal",
  message: "Couldn't reach the server. Check your connection and try again.",
};
const UNKNOWN_ERROR: ApiFailure = { code: "internal", message: "Something went wrong. Please try again." };

async function call<T>(fetchImpl: Fetch, url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
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

const projectUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export function createProjectRequest(name: string, fetchImpl: Fetch = fetch) {
  const body: CreateProjectRequest = { name };
  return call<CreateProjectResponse>(fetchImpl, "/api/projects", "POST", body);
}

export function renameProjectRequest(id: string, name: string, fetchImpl: Fetch = fetch) {
  const body: UpdateProjectRequest = { name };
  return call<UpdateProjectResponse>(fetchImpl, projectUrl(id), "PATCH", body);
}

export function deleteProjectRequest(id: string, fetchImpl: Fetch = fetch) {
  return call<DeleteProjectResponse>(fetchImpl, projectUrl(id), "DELETE");
}
