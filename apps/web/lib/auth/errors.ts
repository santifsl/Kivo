// TODO(A1): switch to the shared API error type from @kivo/shared once A1 is merged.
export type ApiError = { error: { code: string; message: string } };

/** 401 for an owner API call with no Clerk session. */
export function unauthorizedResponse(): Response {
  const body: ApiError = { error: { code: "unauthorized", message: "Sign in required." } };
  return Response.json(body, { status: 401 });
}
