import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGET_CONFIG,
  type WidgetConfig,
  applyPlanToConfig,
  widgetConfigSchema,
} from "./index";

const custom: WidgetConfig = {
  button_color: "#ff3366",
  position: "top-left",
  label: "Help",
  animation: "slide",
  header_text: "Ask us anything",
  show_badge: false,
};

describe("DEFAULT_WIDGET_CONFIG", () => {
  it("has the product owner's defaults and is valid", () => {
    expect(DEFAULT_WIDGET_CONFIG).toEqual({
      button_color: "#000000",
      position: "bottom-right",
      label: "Chat",
      animation: "fade",
      header_text: "How can we help?",
      show_badge: true,
    });
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(true);
  });
});

describe("applyPlanToConfig", () => {
  it("locks Free to the defaults with the badge shown", () => {
    expect(applyPlanToConfig(custom, "free")).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("returns the saved config for Pro", () => {
    expect(applyPlanToConfig(custom, "pro")).toEqual(custom);
  });

  it("does not mutate its input", () => {
    const copy = { ...custom };
    applyPlanToConfig(custom, "free");
    expect(custom).toEqual(copy);
  });
});

describe("widgetConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(widgetConfigSchema.safeParse(custom).success).toBe(true);
  });

  it.each(["red", "#fff", "#12345g", "000000", "#0000000"])(
    "rejects non-hex color %s",
    (button_color) => {
      expect(widgetConfigSchema.safeParse({ ...custom, button_color }).success).toBe(false);
    },
  );

  it("rejects an unknown position or animation", () => {
    expect(widgetConfigSchema.safeParse({ ...custom, position: "center" }).success).toBe(false);
    expect(widgetConfigSchema.safeParse({ ...custom, animation: "bounce" }).success).toBe(false);
  });

  it("rejects an over-long label and header", () => {
    expect(widgetConfigSchema.safeParse({ ...custom, label: "x".repeat(31) }).success).toBe(false);
    expect(widgetConfigSchema.safeParse({ ...custom, header_text: "x".repeat(81) }).success).toBe(
      false,
    );
  });
});
