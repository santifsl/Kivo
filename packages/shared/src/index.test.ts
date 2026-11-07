import { describe, expect, it } from "vitest";
import { APP_NAME } from "./index";

describe("APP_NAME", () => {
  it("is Kivo", () => {
    expect(APP_NAME).toBe("Kivo");
  });
});
