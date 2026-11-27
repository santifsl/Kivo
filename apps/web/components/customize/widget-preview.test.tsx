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

  it("draws the real widget panel (components/embed), not a copy", () => {
    const out = renderToStaticMarkup(
      <WidgetPreview config={{ ...DEFAULT_WIDGET_CONFIG, header_text: "Acme help" }} />,
    );
    // PanelView in preview mode: avatar with the header's letter, Online dot, round input,
    // the icon send button and the badge.
    expect(out).toContain('data-preview="true"');
    expect(out).toMatch(/data-testid="avatar"[^>]*>A</);
    expect(out).toContain('data-testid="online-dot"');
    expect(out).toMatch(/<input[^>]*placeholder="Ask a question…"[^>]*rounded-full/);
    expect(out).toMatch(/<button[^>]*aria-label="Send"[^>]*><svg/);
    expect(out).toContain('data-testid="powered-by"');
    // The old hand-drawn copy is gone: no text "Send" button.
    expect(out).not.toMatch(/>Send</);
    // Still inside the light customer-site frame, with no second h1 on the dashboard page.
    expect(out).toMatch(/data-testid="preview-frame"[\s\S]*data-preview="true"/);
    expect(out).not.toContain("<h1");
  });

  it("follows the badge setting like the real panel", () => {
    const out = renderToStaticMarkup(<WidgetPreview config={{ ...DEFAULT_WIDGET_CONFIG, show_badge: false }} />);
    expect(out).not.toContain("Powered by");
  });
});
