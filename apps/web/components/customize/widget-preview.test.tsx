import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_WIDGET_CONFIG } from "@kivo/shared";
import { describe, expect, it } from "vitest";
import { WidgetPreview } from "./widget-preview";

describe("WidgetPreview", () => {
  it("draws the stage in the widget's fixed look, not the dashboard theme", () => {
    const out = renderToStaticMarkup(<WidgetPreview config={DEFAULT_WIDGET_CONFIG} />);
    // .surface-widget (globals.css) applies /embed's token set, as the real panel never follows the theme.
    expect(out).toMatch(/<div class="surface-widget [^"]*bg-canvas/);
    expect(out.match(/surface-widget/g)).toHaveLength(1);
  });
});
