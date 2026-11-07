import { describe, expect, it } from "vitest";
import { init } from "./index";

describe("widget init", () => {
  it("runs without throwing", () => {
    expect(() => init()).not.toThrow();
  });
});
