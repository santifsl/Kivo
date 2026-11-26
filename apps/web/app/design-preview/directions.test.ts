import { describe, expect, it } from "vitest";
import { DIRECTIONS, directionFrom, isEditorial } from "./directions";

describe("directionFrom", () => {
  it.each(["ink", "glass", "editorial", "cb"] as const)("picks %s from ?dir", (id) => {
    expect(directionFrom(id)).toBe(id);
  });

  it("uses the first value when ?dir repeats", () => {
    expect(directionFrom(["glass", "ink"])).toBe("glass");
  });

  it.each([undefined, "", "INK", "unknown", []])("defaults to C+B for %j", (value) => {
    expect(directionFrom(value)).toBe("cb");
  });
});

describe("isEditorial", () => {
  it("is true only for C and C+B", () => {
    expect(DIRECTIONS.filter(({ id }) => isEditorial(id)).map(({ id }) => id)).toEqual([
      "editorial",
      "cb",
    ]);
  });
});
