import { API_ERROR_STATUS, type ApiError, type ApiErrorCode } from "@kivo/shared";

/** Owner API responses hold the owner's data: never cache them. */
const NO_STORE = { "Cache-Control": "no-store" } as const;

/** JSON success response for an owner route. */
export function ownerJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** `{ error: { code, message } }` with the code's status. */
export function ownerError(code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status: API_ERROR_STATUS[code], headers: NO_STORE });
}

/** The request's JSON body, or `undefined` if it isn't valid JSON (the schema then rejects it). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** Logs an unexpected error on the server and returns a generic 500. */
export function internalError(where: string, err: unknown): Response {
  console.error(`[${where}]`, err instanceof Error ? err.message : err);
  return ownerError("internal", "Something went wrong.");
}
