import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PanelView, type PanelViewProps } from "./panel-view";

const noop = () => {};
const render = (overrides: Partial<PanelViewProps> = {}) =>
  renderToStaticMarkup(
    <PanelView
      phase="ready"
      headerText="Acme help"
      showBadge
      messages={[]}
      typing={false}
      error={null}
      draft=""
      onDraftChange={noop}
      onSubmit={noop}
      onClose={noop}
      onRetry={noop}
      {...overrides}
    />,
  );

describe("PanelView preview mode (the Customize live preview)", () => {
  it("leaves the live widget unchanged without the prop", () => {
    const live = render();
    expect(live).toMatch(/<section[^>]*class="[^"]*h-dvh/);
    expect(live).toContain("<h1");
    expect(live).not.toContain("data-preview");
    expect(live).not.toContain("tabindex");
    expect(live).not.toContain("readonly");
  });

  it("fills its container, keeps the header out of the page outline and the controls out of the tab order", () => {
    const preview = render({ preview: true });
    expect(preview).toMatch(/<section[^>]*data-preview="true"[^>]*class="[^"]*h-full/);
    expect(preview).not.toContain("h-dvh");
    expect(preview).not.toContain("<h1");
    expect(preview).toMatch(/<p class="truncate[^"]*">Acme help<\/p>/);
    expect(preview).toMatch(/<input[^>]*readOnly=""[^>]*tabindex="-1"|<input[^>]*tabindex="-1"[^>]*readOnly=""/i);
    expect(preview).toMatch(/<button[^>]*aria-label="Send"[^>]*tabindex="-1"/);
    expect(preview).toMatch(/data-testid="powered-by"[^>]*tabindex="-1"/);
  });

  it("draws the same panel in both modes, apart from those attributes", () => {
    const strip = (html: string) =>
      html
        .replace(/ data-preview="true"| tabindex="-1"| readOnly=""/gi, "")
        .replace(/h-dvh|h-full/g, "H")
        .replace(/<(\/?)(h1|p)( class="truncate)/g, "<$1T$3")
        .replace(/<\/(h1|p)>(?=<p class="flex items-center gap-1.5)/, "</T>");
    expect(strip(render({ preview: true }))).toBe(strip(render()));
  });
});
