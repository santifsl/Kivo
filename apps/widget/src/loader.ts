/**
 * Widget loader: runs on the customer's site. docs/project.md §6.5, §9.
 *
 * Reads `data-key` from its own <script> tag, fetches the widget config from
 * the origin it was served from, and renders a chat button in a shadow root.
 * The button opens the chat panel (`/embed`) in an iframe.
 *
 * Size budget: under 5 kb gzipped. Import only `@kivo/shared/embed` (no zod)
 * and type-only imports from `@kivo/shared`.
 */
import type {
  WidgetAnimation,
  WidgetConfig,
  WidgetConfigResponse,
  WidgetPosition,
} from "@kivo/shared";
import {
  EMBED_PATH,
  EMBED_QUERY,
  isPanelMessage,
  LOADER_MESSAGE_SOURCE,
  type LoaderMessage,
} from "@kivo/shared/embed";

/** Same format as `publicKeySchema` in `@kivo/shared` (kept here to stay zod-free). */
const KEY_RE = /^pk_[A-Za-z0-9_-]{8,64}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const POSITIONS: readonly WidgetPosition[] = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];
const ANIMATIONS: readonly WidgetAnimation[] = ["fade", "slide", "scale"];

/** Tag of the single element the loader adds to the host page. */
export const HOST_TAG = "chat-widget-host";

/** Panel size on desktop, in CSS pixels. Under 480 px wide it goes full screen. */
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 600;

type ButtonConfig = Pick<WidgetConfig, "button_color" | "position" | "label" | "animation">;

function readConfig(body: unknown): ButtonConfig | null {
  const c = (body as Partial<WidgetConfigResponse> | null)?.config;
  if (
    !c ||
    !COLOR_RE.test(c.button_color) ||
    !POSITIONS.includes(c.position) ||
    !ANIMATIONS.includes(c.animation) ||
    typeof c.label !== "string" ||
    !c.label.trim()
  ) {
    return null;
  }
  return c;
}

const HIDDEN: Record<WidgetAnimation, string> = {
  fade: "",
  slide: "transform:translateY(16px);",
  scale: "transform:scale(.9);",
};

function styles(config: ButtonConfig): string {
  const [v, h] = config.position.split("-");
  // `!important` on :host wins over any host-page rule (shadow-scoped
  // important declarations beat outer ones), so `* { all: unset }` etc. can't
  // move or restyle the widget. Nothing inside the shadow root is reachable
  // by host selectors.
  return (
    `:host{all:initial!important;position:fixed!important;${v}:20px!important;${h}:20px!important;` +
    `z-index:2147483647!important;display:block!important;font:14px/1.2 system-ui,sans-serif!important}` +
    `button{all:initial;box-sizing:border-box;position:relative;display:flex;align-items:center;gap:8px;` +
    `height:48px;padding:0 20px;border-radius:24px;cursor:pointer;font:600 15px/1 system-ui,sans-serif;` +
    // A faint white ring + soft shadow keep a dark launcher visible on a dark page.
    `color:#fff;background:${config.button_color};` +
    `box-shadow:0 0 0 2px rgba(255,255,255,.2),0 2px 6px rgba(0,0,0,.2),0 8px 24px rgba(0,0,0,.28)}` +
    `button:focus-visible{outline:2px solid ${config.button_color};outline-offset:3px}` +
    `.d{position:absolute;top:-2px;${h === "left" ? "left" : "right"}:-2px;width:12px;height:12px;` +
    `border-radius:50%;background:#e5484d;border:2px solid #fff;display:none}` +
    `.u .d{display:block}` +
    `.p{position:absolute;${v}:60px;${h}:0;width:${PANEL_WIDTH}px;height:${PANEL_HEIGHT}px;` +
    `max-height:calc(100vh - 100px);border:0;border-radius:12px;background:#fff;` +
    `box-shadow:0 8px 30px rgba(0,0,0,.2);transform-origin:${v} ${h};` +
    `opacity:0;visibility:hidden;pointer-events:none;${HIDDEN[config.animation]}` +
    `transition:opacity .2s,transform .2s,visibility .2s}` +
    `.p.o{opacity:1;visibility:visible;pointer-events:auto;transform:none}` +
    `@media (max-width:479px){.p{position:fixed;inset:0;width:100%;height:100%!important;` +
    `max-height:none;border-radius:0}}` +
    `@media (prefers-reduced-motion:reduce){.p{transition:none}}`
  );
}

/**
 * Mounts the widget for `script` (normally `document.currentScript`).
 * Never throws: a missing script, bad key, or failed config fetch renders
 * nothing. Resolves to the host element, or null when nothing rendered.
 */
export async function mount(script: HTMLOrSVGScriptElement | null): Promise<HTMLElement | null> {
  try {
    if (!(script instanceof HTMLScriptElement)) return null;
    const key = script.dataset.key ?? "";
    if (!KEY_RE.test(key)) return null;
    // The app origin is where this script came from. No env var in the bundle.
    const appOrigin = new URL(script.src).origin;
    if (appOrigin === "null") return null;

    const res = await fetch(`${appOrigin}/api/widget/config?key=${encodeURIComponent(key)}`, {
      // Same-origin pages can use their Preview session; external embeds send no cookies.
      credentials: "same-origin",
    });
    if (res.status !== 200) return null;
    const config = readConfig(await res.json());
    if (!config) return null;

    return render(config, key, appOrigin);
  } catch {
    return null;
  }
}

function render(config: ButtonConfig, key: string, appOrigin: string): HTMLElement {
  const host = document.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = styles(config);

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", config.label);
  button.setAttribute("aria-expanded", "false");
  button.textContent = config.label; // text, never HTML
  const dot = document.createElement("span");
  dot.className = "d";
  dot.setAttribute("aria-hidden", "true");
  button.append(dot);

  root.append(style, button);

  let frame: HTMLIFrameElement | null = null;
  let open = false;

  const post = (message: LoaderMessage) => {
    // Target is always the app origin, never "*".
    frame?.contentWindow?.postMessage(message, appOrigin);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false, true);
  };

  const setOpen = (next: boolean, focusButton = false) => {
    if (next === open) return;
    open = next;
    if (next && !frame) {
      const url = new URL(EMBED_PATH, appOrigin);
      url.searchParams.set(EMBED_QUERY.key, key);
      url.searchParams.set(EMBED_QUERY.origin, location.origin);
      frame = document.createElement("iframe");
      frame.className = "p";
      frame.title = config.label;
      frame.src = url.href;
      root.append(frame);
      // Let the hidden state paint first so the open transition runs.
      void frame.offsetWidth;
    }
    frame?.classList.toggle("o", next);
    button.setAttribute("aria-expanded", String(next));
    if (next) {
      window.addEventListener("keydown", onKey);
      frame?.focus();
    } else {
      window.removeEventListener("keydown", onKey);
      if (focusButton) button.focus();
    }
    post({ source: LOADER_MESSAGE_SOURCE, type: "visibility", open: next });
  };

  button.addEventListener("click", () => setOpen(!open));

  window.addEventListener("message", (event: MessageEvent) => {
    // Origin AND source window first, then the shape guard.
    if (event.origin !== appOrigin || !frame || event.source !== frame.contentWindow) return;
    const data: unknown = event.data;
    if (!isPanelMessage(data)) return;
    switch (data.type) {
      case "ready":
        post({ source: LOADER_MESSAGE_SOURCE, type: "visibility", open });
        break;
      case "close":
        setOpen(false, true);
        break;
      case "resize":
        frame.style.height = `${Math.min(Math.max(data.height, 120), PANEL_HEIGHT)}px`;
        break;
      case "unread":
        button.classList.toggle("u", data.count > 0);
        break;
    }
  });

  // A script in <head> can get its config back before <body> exists.
  if (document.body) document.body.append(host);
  else document.addEventListener("DOMContentLoaded", () => document.body.append(host));
  return host;
}
