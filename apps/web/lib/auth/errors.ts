import { API_ERROR_STATUS, type ApiError, type ApiErrorCode } from "@kivo/shared";

/** 401 for an owner API call with no Clerk session. `no-store` so no browser or CDN caches it. */
export function unauthorizedResponse(): Response {
  const code: ApiErrorCode = "unauthorized";
  const body: ApiError = { error: { code, message: "Sign in required." } };
  return Response.json(body, {
    status: API_ERROR_STATUS[code],
    headers: { "Cache-Control": "no-store" },
  });
}
