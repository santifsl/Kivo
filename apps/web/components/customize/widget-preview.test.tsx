import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_WIDGET_CONFIG, WIDGET_POSITIONS } from "@kivo/shared";
import { describe, expect, it } from "vitest";
import { LAUNCHER_INSET, WidgetPreview } from "./widget-preview";

const anchorClasses = (html: string) =>
  (/data-testid="launcher-anchor" class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ");

describe("WidgetPreview", () => {
  it("draws the customer-site frame in the widget's fixed look, not the dashboard theme", () => {
    const out = renderToStaticMarkup(<WidgetPreview config={DEFAULT_WIDGET_CONFIG} />);
    // .surface-widget (globals.css) applies /embed's token set, as the real panel never follows the theme.
    expect(out).toMatch(/data-testid="preview-frame" class="surface-widget [^"]*bg-canvas/);
    expect(out.match(/surface-widget/g)).toHaveLength(1);
  });

  it.each(WIDGET_POSITIONS)("insets the launcher 20 px from both edges at %s", (position) => {
    const classes = anchorClasses(renderToStaticMarkup(<WidgetPreview config={{ ...DEFAULT_WIDGET_CONFIG, position }} />));
    const [vertical, horizontal] = position.split("-") as ["top" | "bottom", "left" | "right"];
    expect(classes).toContain(LAUNCHER_INSET[vertical]);
    expect(classes).toContain(LAUNCHER_INSET[horizontal]);
    expect(Object.values(LAUNCHER_INSET).every((c) => c.endsWith("-5"))).toBe(true);
    // Nothing pins it to the frame's edge.
    expect(classes.some((c) => /^(inset|top|bottom|left|right)-(0|px)$/.test(c))).toBe(false);
  });
});
