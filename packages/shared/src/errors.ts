import { z } from "zod";

export const API_ERROR_CODES = [
  "unauthorized", // 401: no or bad session
  "forbidden", // 403: signed in, not allowed
  "not_found", // 404
  "invalid_input", // 400: failed the zod schema
  "plan_limit", // 403: a count limit (projects, knowledge sources) reached
  "payment_required", // 402: a Pro-only action on Free
  "quota_exceeded", // 429: monthly message quota used up
  "rate_limited", // 429: too many requests
  "message_blocked", // 400: blocked by prompt-injection detection
  "invalid_signature", // 400: webhook signature check failed
  "internal", // 500
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** HTTP status for each error code. */
export const API_ERROR_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  plan_limit: 403,
  payment_required: 402,
  quota_exceeded: 429,
  rate_limited: 429,
  message_blocked: 400,
  invalid_signature: 400,
  internal: 500,
} as const satisfies Record<ApiErrorCode, number>;

/** Every API error body: `{ error: { code, message } }`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Body for routes that only confirm success. */
export interface OkResponse {
  ok: true;
}
