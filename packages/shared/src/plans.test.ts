import { describe, expect, it } from "vitest";
import { APP_NAME, PLAN_LIMITS, PLAN_PRICES } from "./index";

describe("APP_NAME", () => {
  it("is Kivo", () => {
    expect(APP_NAME).toBe("Kivo");
  });
});

describe("PLAN_LIMITS", () => {
  it("matches docs/project.md §5", () => {
    expect(PLAN_LIMITS).toEqual({
      free: {
        projects: 1,
        messagesPerMonth: 100,
        knowledgeSources: 3,
        customColor: false,
        anyPosition: false,
        customLabel: false,
        animations: ["fade"],
        customHeader: false,
        hideBadge: false,
      },
      pro: {
        projects: 5,
        messagesPerMonth: 2000,
        knowledgeSources: 25,
        customColor: true,
        anyPosition: true,
        customLabel: true,
        animations: ["fade", "slide", "scale"],
        customHeader: true,
        hideBadge: true,
      },
    });
  });
});

describe("PLAN_PRICES", () => {
  it("is free $0 and pro $9 per month", () => {
    expect(PLAN_PRICES).toEqual({ free: 0, pro: 9 });
  });
});
