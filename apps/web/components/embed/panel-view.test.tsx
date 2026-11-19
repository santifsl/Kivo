import { APP_NAME, MAX_MESSAGE_LENGTH } from "@kivo/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/embed/chat-state";
import { PanelView, type PanelViewProps } from "./panel-view";

const noop = () => {};
function render(overrides: Partial<PanelViewProps> = {}) {
  return renderToStaticMarkup(
    <PanelView
      phase="ready"
      headerText="How can we help?"
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
}

describe("PanelView", () => {
  it("shows the header, a close button and the input limited to MAX_MESSAGE_LENGTH", () => {
    const out = render();
    expect(out).toContain("How can we help?");
    expect(out).toContain('aria-label="Close chat"');
    expect(out).toContain(`maxLength="${MAX_MESSAGE_LENGTH}"`);
  });

  it("renders a message containing HTML as literal text", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "visitor", text: "<img src=x onerror=alert(1)>" },
      { id: "2", role: "bot", text: "<b>bold</b>" },
    ];
    const out = render({ messages });
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("shows the badge only when show_badge is true, opening the landing page safely", () => {
    const on = render({ showBadge: true });
    expect(on).toContain(`Powered by ${APP_NAME}`);
    expect(on).toContain('target="_blank"');
    expect(on).toContain('rel="noopener"');
    expect(render({ showBadge: false })).not.toContain("Powered by");
  });

  it("shows the typing state and disables send while waiting", () => {
    const out = render({ typing: true, draft: "hello" });
    expect(out).toContain('data-testid="typing"');
    expect(out).toMatch(/<button type="submit" disabled=""/);
  });

  it("has empty, loading and error states", () => {
    expect(render()).toContain("Ask a question");
    const loading = render({ phase: "loading" });
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain("<form");
    const error = render({ phase: "error" });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Try again");
    expect(error).not.toContain("<form");
  });

  it("shows a send error without losing messages", () => {
    const out = render({
      error: "Sorry, try again.",
      messages: [{ id: "1", role: "visitor", text: "Hi" }],
    });
    expect(out).toContain("Sorry, try again.");
    expect(out).toContain("Hi");
  });
});
