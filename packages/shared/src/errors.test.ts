import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, API_ERROR_STATUS, apiErrorSchema } from "./index";

describe("apiErrorSchema", () => {
  it("accepts { error: { code, message } }", () => {
    expect(
      apiErrorSchema.safeParse({ error: { code: "plan_limit", message: "Upgrade" } }).success,
    ).toBe(true);
  });

  it("rejects an unknown code or a flat shape", () => {
    expect(apiErrorSchema.safeParse({ error: { code: "oops", message: "x" } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ code: "internal", message: "x" }).success).toBe(false);
  });
});

describe("API_ERROR_STATUS", () => {
  it("maps every code to an HTTP error status", () => {
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(API_ERROR_STATUS.payment_required).toBe(402);
  });
});
