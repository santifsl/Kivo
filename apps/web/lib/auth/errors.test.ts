import { describe, expect, it } from "vitest";
import { apiErrorSchema } from "@kivo/shared";
import { unauthorizedResponse } from "./errors";

describe("unauthorizedResponse", () => {
  it("is a 401 with the { error: { code, message } } body", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body: unknown = await res.json();
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });

  it("is never cached", () => {
    expect(unauthorizedResponse().headers.get("cache-control")).toBe("no-store");
  });
});
