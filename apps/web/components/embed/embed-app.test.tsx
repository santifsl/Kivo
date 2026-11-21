// @vitest-environment jsdom

import { API_ERROR_STATUS, DEFAULT_WIDGET_CONFIG, type ChatRequest } from "@kivo/shared";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VISITOR_ID_STORAGE_KEY } from "../../lib/embed/visitor-id";
import { EmbedApp } from "./embed-app";

const KEY = "pk_abc123XYZ_789";
const VISITOR_ID = "existing-visitor";
const CONVERSATION_ID = "e20e5183-0730-4128-9fe3-089da2688c66";

describe("EmbedApp sending messages", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ config: DEFAULT_WIDGET_CONFIG }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, VISITOR_ID);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<EmbedApp publicKey={KEY} hostOrigin={null} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  async function submit(message: string) {
    const input = container.querySelector("input");
    const button = container.querySelector<HTMLButtonElement>("button[type=submit]");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!input || !button || !setValue) throw new Error("Chat form did not render");
    await act(async () => {
      setValue.call(input, message);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button.click());
  }

  function expectChatRequest(call: number, request: ChatRequest) {
    expect(fetchMock).toHaveBeenNthCalledWith(call, "/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }

  it("shows typing, renders the reply as text, and sends the returned conversation ID next", async () => {
    let resolveReply: (response: Response) => void = () => {
      throw new Error("Reply promise was not initialized");
    };
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveReply = resolve;
      }),
    );
    await submit("  Hello  ");
    expectChatRequest(2, { key: KEY, visitorId: VISITOR_ID, message: "Hello" });
    expect(container.querySelector('[data-role="visitor"]')?.textContent).toContain("Hello");
    expect(container.querySelector('[data-testid="typing"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(true);

    await act(async () =>
      resolveReply(Response.json({ conversationId: CONVERSATION_ID, reply: "<b>Hi</b>" })),
    );
    const reply = container.querySelector('[data-role="bot"]');
    expect(reply?.textContent).toContain("<b>Hi</b>");
    expect(reply?.querySelector("b")).toBeNull();
    expect(container.querySelector('[data-testid="typing"]')).toBeNull();

    fetchMock.mockResolvedValueOnce(
      Response.json({ conversationId: CONVERSATION_ID, reply: "Yes" }),
    );
    await submit("And then?");
    expectChatRequest(3, {
      key: KEY,
      visitorId: VISITOR_ID,
      message: "And then?",
      conversationId: CONVERSATION_ID,
    });
    expect(container.querySelectorAll('[data-role="bot"]')).toHaveLength(2);
  });

  it.each([
    ["rate_limited", "Too many messages. Please wait a minute before trying again."],
    ["quota_exceeded", "This assistant has reached its message limit for the month."],
    ["message_blocked", "This message couldn't be answered. Try asking a different question."],
  ] as const)("shows the visitor message for %s", async (code, message) => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: { code, message: "Server details" } },
        { status: API_ERROR_STATUS[code] },
      ),
    );
    await submit("Hello");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(container.querySelector('[data-testid="typing"]')).toBeNull();
    expect(container.querySelector('[data-role="bot"]')).toBeNull();
  });

  it("clears a network error on the next send without losing the conversation ID", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ conversationId: CONVERSATION_ID, reply: "Hi" }),
    );
    await submit("Hello");
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    await submit("Are you there?");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Sorry, something went wrong. Please try again.",
    );
    expect(container.querySelector('[data-testid="typing"]')).toBeNull();
    expect(container.querySelectorAll('[data-role="bot"]')).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(
      Response.json({ conversationId: CONVERSATION_ID, reply: "Yes" }),
    );
    await submit("Can we continue?");
    expectChatRequest(4, {
      key: KEY,
      visitorId: VISITOR_ID,
      message: "Can we continue?",
      conversationId: CONVERSATION_ID,
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("treats a malformed success response as a generic failure", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ conversationId: "bad-id", reply: "Ignored" }));
    await submit("Hello");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Sorry, something went wrong. Please try again.",
    );
    expect(container.querySelector('[data-role="bot"]')).toBeNull();
  });
});
