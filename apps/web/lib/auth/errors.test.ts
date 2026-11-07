import { describe, expect, it } from "vitest";
import { unauthorizedResponse } from "./errors";

describe("unauthorizedResponse", () => {
  it("is a 401 with the { error: { code, message } } body", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });
});
