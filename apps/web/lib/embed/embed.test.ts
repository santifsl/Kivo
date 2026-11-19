import { VISITOR_ID_MAX_LENGTH } from "@kivo/shared";
import { LOADER_MESSAGE_SOURCE, PANEL_MESSAGE_SOURCE } from "@kivo/shared/embed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatReducer, INITIAL_CHAT_STATE } from "./chat-state";
import { createPanelMessenger } from "./messenger";
import { MOCK_REPLY, MOCK_REPLY_DELAY_MS, sendChatMessage } from "./mock-reply";
import { parseHostOrigin } from "./origin";
import { getVisitorId, resetVisitorIdMemory, VISITOR_ID_STORAGE_KEY } from "./visitor-id";

const HOST = "https://host.example";
const KEY = "pk_abc123XYZ_789";

describe("parseHostOrigin", () => {
  it.each([HOST, "http://localhost:8080"])("accepts %s", (o) => {
    expect(parseHostOrigin(o)).toBe(o);
  });
  it.each([
    null,
    "",
    "null",
    "*",
    "javascript:alert(1)",
    "file:///etc",
    "https://host.example/",
    "https://host.example/path",
    "https://user:pw@host.example",
    "host.example",
  ])("rejects %s", (o) => {
    expect(parseHostOrigin(o)).toBeNull();
  });
});

describe("chat flow: send → typing → mock reply", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows typing after send, then the mock reply after the delay", async () => {
    let state = chatReducer(INITIAL_CHAT_STATE, { type: "send", id: "v1", text: "Hi" });
    expect(state.status).toBe("typing");
    expect(state.messages).toEqual([{ id: "v1", role: "visitor", text: "Hi" }]);

    let settled = false;
    const pending = sendChatMessage({ key: KEY, visitorId: "v", message: "Hi" }).then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.reply).toBe(MOCK_REPLY);

    state = chatReducer(state, {
      type: "reply",
      id: "b1",
      text: res.reply,
      conversationId: res.conversationId,
    });
    expect(state.status).toBe("idle");
    expect(state.conversationId).toBe(res.conversationId);
    expect(state.messages.at(-1)).toEqual({ id: "b1", role: "bot", text: MOCK_REPLY });
  });

  it("keeps the conversation id it was given", async () => {
    const pending = sendChatMessage({
      key: KEY,
      visitorId: "v",
      message: "Hi",
      conversationId: "c-1",
    });
    await vi.advanceTimersByTimeAsync(MOCK_REPLY_DELAY_MS);
    expect((await pending).conversationId).toBe("c-1");
  });

  it("fail stops typing and keeps the messages", () => {
    const sent = chatReducer(INITIAL_CHAT_STATE, { type: "send", id: "v1", text: "Hi" });
    const failed = chatReducer(sent, { type: "fail", error: "nope" });
    expect(failed.status).toBe("idle");
    expect(failed.error).toBe("nope");
    expect(failed.messages).toHaveLength(1);
  });
});

describe("getVisitorId", () => {
  beforeEach(() => resetVisitorIdMemory());

  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => void map.delete(k),
      setItem: (k, v) => void map.set(k, v),
    };
  }

  it("is stable across reloads (same storage)", () => {
    const storage = memoryStorage();
    const first = getVisitorId(() => storage);
    resetVisitorIdMemory(); // a reload loses memory, not storage
    expect(getVisitorId(() => storage)).toBe(first);
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(first);
    expect(first.length).toBeLessThanOrEqual(VISITOR_ID_MAX_LENGTH);
  });

  it("replaces a stored value that is too long", () => {
    const storage = memoryStorage();
    storage.setItem(VISITOR_ID_STORAGE_KEY, "x".repeat(VISITOR_ID_MAX_LENGTH + 1));
    const id = getVisitorId(() => storage);
    expect(id.length).toBeLessThanOrEqual(VISITOR_ID_MAX_LENGTH);
    expect(storage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(id);
  });

  it("falls back to a stable in-memory id when storage throws", () => {
    const throwing = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const a = getVisitorId(throwing);
    expect(a).toBeTruthy();
    expect(getVisitorId(throwing)).toBe(a);

    const getItemThrows = memoryStorage();
    getItemThrows.getItem = () => {
      throw new Error("partitioned");
    };
    expect(getVisitorId(() => getItemThrows)).toBe(a);
  });
});

describe("createPanelMessenger", () => {
  function setup(hostOrigin: string | null = HOST) {
    const parent = { postMessage: vi.fn() };
    const target = new EventTarget();
    const onMessage = vi.fn();
    const messenger = createPanelMessenger({
      hostOrigin,
      parent: parent as unknown as Window,
      listenOn: target as unknown as Window,
      onMessage,
    });
    const deliver = (data: unknown, origin = HOST, source: unknown = parent) => {
      const event = new Event("message") as MessageEvent;
      Object.defineProperties(event, {
        data: { value: data },
        origin: { value: origin },
        source: { value: source },
      });
      target.dispatchEvent(event);
    };
    return { parent, onMessage, messenger, deliver };
  }
  const visibility = { source: LOADER_MESSAGE_SOURCE, type: "visibility", open: true };

  it("posts to the origin param, never *", () => {
    const { parent, messenger } = setup();
    messenger.post({ type: "ready" });
    messenger.post({ type: "close" });
    messenger.post({ type: "unread", count: 2 });
    expect(parent.postMessage).toHaveBeenNthCalledWith(
      1,
      { type: "ready", source: PANEL_MESSAGE_SOURCE },
      HOST,
    );
    expect(parent.postMessage).toHaveBeenCalledTimes(3);
    for (const call of parent.postMessage.mock.calls) expect(call[1]).toBe(HOST);
  });

  it("never posts without a valid origin", () => {
    const { parent, messenger } = setup(null);
    messenger.post({ type: "ready" });
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it("accepts a loader message from the origin and the parent window", () => {
    const { onMessage, deliver } = setup();
    deliver(visibility);
    expect(onMessage).toHaveBeenCalledWith(visibility);
  });

  it("ignores messages from other origins, other windows, or with a bad shape", () => {
    const { onMessage, deliver } = setup();
    deliver(visibility, "https://evil.example");
    deliver(visibility, HOST, {});
    deliver({ type: "visibility", open: true });
    deliver({ ...visibility, open: "yes" });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("stops listening after dispose", () => {
    const { onMessage, deliver, messenger } = setup();
    messenger.dispose();
    deliver(visibility);
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe("isNearBottom", () => {
  it("is true at or near the bottom, false when scrolled up", async () => {
    const { isNearBottom, FOLLOW_THRESHOLD_PX } = await import("./follow-bottom");
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })).toBe(true);
    expect(
      isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 - FOLLOW_THRESHOLD_PX }),
    ).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 500 })).toBe(false);
    expect(isNearBottom({ scrollHeight: 300, clientHeight: 400, scrollTop: 0 })).toBe(true);
  });
});
