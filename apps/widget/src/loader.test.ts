import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@kivo/shared";
import { LOADER_MESSAGE_SOURCE, PANEL_MESSAGE_SOURCE } from "@kivo/shared/embed";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOST_TAG, mount } from "./loader";

const APP = "https://app.example";
const KEY = "pk_abc123XYZ_789";

function script(key: string | null = KEY, src = `${APP}/widget.js`): HTMLScriptElement {
  const s = document.createElement("script");
  s.src = src;
  if (key !== null) s.dataset.key = key;
  return s;
}

function respond(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function mountWith(config: WidgetConfig = DEFAULT_WIDGET_CONFIG) {
  respond(200, { config });
  const host = await mount(script());
  if (!host?.shadowRoot) throw new Error("widget did not render");
  const root = host.shadowRoot;
  const button = root.querySelector("button");
  if (!button) throw new Error("no button");
  const frame = () => root.querySelector("iframe");
  const css = root.querySelector("style")?.textContent ?? "";
  return { host, root, button, frame, css };
}

function fromPanel(data: unknown, source: MessageEventSource | null, origin = APP) {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mount: render or nothing", () => {
  it("renders a button in a shadow root with the config color, label and position", async () => {
    const config: WidgetConfig = {
      ...DEFAULT_WIDGET_CONFIG,
      button_color: "#1a2b3c",
      label: "Ask us",
      position: "top-left",
    };
    const { host, button, css } = await mountWith(config);

    expect(host.tagName.toLowerCase()).toBe(HOST_TAG);
    expect(document.body.children).toHaveLength(1);
    expect(button.textContent).toBe("Ask us");
    expect(button.getAttribute("aria-label")).toBe("Ask us");
    expect(css).toContain("background:#1a2b3c");
    expect(css).toContain("top:20px!important;left:20px!important");
    // Nothing leaks into the host page's document.
    expect(document.querySelector("button, style, iframe")).toBeNull();
  });

  it("keeps the launcher visible on dark pages: a faint white ring and a soft shadow", async () => {
    const { css } = await mountWith({ ...DEFAULT_WIDGET_CONFIG, button_color: "#000000" });
    const button = /(?:^|\})button\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(button).toContain("background:#000000");
    expect(button).toMatch(/box-shadow:0 0 0 2px rgba\(255,255,255,\.2\),[^;}]*rgba\(0,0,0,/);
  });

  it("fetches the config from the script's origin with same-origin credentials", async () => {
    const fetchMock = respond(200, { config: DEFAULT_WIDGET_CONFIG });
    await mount(script());
    expect(fetchMock).toHaveBeenCalledWith(`${APP}/api/widget/config?key=${KEY}`, {
      credentials: "same-origin",
    });
  });

  it("renders the label as text, never HTML", async () => {
    const { button } = await mountWith({ ...DEFAULT_WIDGET_CONFIG, label: "<img src=x>" });
    expect(button.querySelector("img")).toBeNull();
    expect(button.textContent).toBe("<img src=x>");
  });

  it.each([
    ["missing key", null],
    ["bad key format", "abc"],
    ["key with bad characters", "pk_abc123<script>"],
  ])("renders nothing and fetches nothing on %s", async (_, key) => {
    const fetchMock = respond(200, { config: DEFAULT_WIDGET_CONFIG });
    await expect(mount(script(key))).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe("");
  });

  it("renders nothing without a script element", async () => {
    await expect(mount(null)).resolves.toBeNull();
    expect(document.body.innerHTML).toBe("");
  });

  it.each([404, 400, 429, 500])("renders nothing on HTTP %i", async (status) => {
    respond(status, { error: { code: "not_found", message: "Unknown widget key." } });
    await expect(mount(script())).resolves.toBeNull();
    expect(document.body.innerHTML).toBe("");
  });

  it("renders nothing on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(mount(script())).resolves.toBeNull();
    expect(document.body.innerHTML).toBe("");
  });

  it("renders nothing on a malformed config", async () => {
    respond(200, { config: { ...DEFAULT_WIDGET_CONFIG, button_color: "red;}*{x:y" } });
    await expect(mount(script())).resolves.toBeNull();
    respond(200, { nope: true });
    await expect(mount(script())).resolves.toBeNull();
    expect(document.body.innerHTML).toBe("");
  });
});

describe("open and close", () => {
  it("opens the embed iframe with key and host origin, then closes on a second click", async () => {
    const { button, frame } = await mountWith();
    expect(frame()).toBeNull();

    button.click();
    const f = frame();
    expect(f).not.toBeNull();
    const url = new URL(f?.src ?? "");
    expect(url.origin + url.pathname).toBe(`${APP}/embed`);
    expect(url.searchParams.get("key")).toBe(KEY);
    expect(url.searchParams.get("origin")).toBe(location.origin);
    expect(f?.classList.contains("o")).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");

    button.click();
    expect(f?.classList.contains("o")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses the configured animation", async () => {
    const { css } = await mountWith({ ...DEFAULT_WIDGET_CONFIG, animation: "slide" });
    expect(css).toContain("translateY(16px)");
  });

  it("closes on Escape", async () => {
    const { button, frame } = await mountWith();
    button.click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(frame()?.classList.contains("o")).toBe(false);
  });

  it("sends visibility to the panel with the app origin as target, never *", async () => {
    const { button, frame } = await mountWith();
    button.click();
    const win = frame()?.contentWindow;
    if (!win) throw new Error("no contentWindow");
    const postSpy = vi.spyOn(win, "postMessage");

    button.click();
    fromPanel({ source: PANEL_MESSAGE_SOURCE, type: "ready" }, win);

    expect(postSpy).toHaveBeenCalledWith(
      { source: LOADER_MESSAGE_SOURCE, type: "visibility", open: false },
      APP,
    );
    expect(postSpy).toHaveBeenCalledTimes(2);
    for (const call of postSpy.mock.calls) expect(call[1]).toBe(APP);
  });
});

describe("panel messages", () => {
  async function opened() {
    const w = await mountWith();
    w.button.click();
    const f = w.frame();
    const win = f?.contentWindow;
    if (!f || !win) throw new Error("no iframe");
    return { ...w, f, win };
  }
  const close = { source: PANEL_MESSAGE_SOURCE, type: "close" };

  it("close closes the iframe", async () => {
    const { f, win, button } = await opened();
    fromPanel(close, win);
    expect(f.classList.contains("o")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores messages from a wrong origin", async () => {
    const { f, win } = await opened();
    fromPanel(close, win, "https://evil.example");
    expect(f.classList.contains("o")).toBe(true);
  });

  it("ignores messages from a wrong source window", async () => {
    const { f } = await opened();
    fromPanel(close, window);
    fromPanel(close, null);
    expect(f.classList.contains("o")).toBe(true);
  });

  it("ignores malformed messages", async () => {
    const { f, win } = await opened();
    fromPanel({ type: "close" }, win);
    fromPanel("close", win);
    expect(f.classList.contains("o")).toBe(true);
  });

  it("unread shows and hides the dot", async () => {
    const { button, win } = await opened();
    fromPanel({ source: PANEL_MESSAGE_SOURCE, type: "unread", count: 2 }, win);
    expect(button.classList.contains("u")).toBe(true);
    fromPanel({ source: PANEL_MESSAGE_SOURCE, type: "unread", count: 0 }, win);
    expect(button.classList.contains("u")).toBe(false);
  });

  it("resize sets the panel height, capped at the desktop size", async () => {
    const { f, win } = await opened();
    fromPanel({ source: PANEL_MESSAGE_SOURCE, type: "resize", height: 400 }, win);
    expect(f.style.height).toBe("400px");
    fromPanel({ source: PANEL_MESSAGE_SOURCE, type: "resize", height: 5000 }, win);
    expect(f.style.height).toBe("600px");
  });
});
