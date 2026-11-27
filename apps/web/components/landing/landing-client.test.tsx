// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findLauncher,
  OpenChatButton,
  openLandingChat,
  whenLauncherReady,
} from "./open-chat-button";
import { Reveal } from "./reveal";
import { SiteNav } from "./site-nav";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));

/** Fails the test with a clear message instead of a non-null assertion. */
function must<T>(value: T | null | undefined, what = "element"): T {
  if (value == null) throw new Error(`missing ${what}`);
  return value;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("SiteNav", () => {
  it("opens the sheet with the same links, and closes it on a link or Escape", async () => {
    await act(async () => root.render(<SiteNav />));
    const toggle = must(host.querySelector<HTMLButtonElement>("button[aria-controls]"));
    const sheet = must(host.querySelector<HTMLElement>('[data-testid="nav-sheet"]'));
    expect(sheet.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await act(async () => toggle.click());
    expect(sheet.hidden).toBe(false);
    expect(toggle.getAttribute("aria-label")).toBe("Close menu");
    expect(toggle.getAttribute("aria-controls")).toBe(sheet.id);
    expect(
      [...sheet.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]),
    ).toEqual([
      ["How it works", "#how-it-works"],
      ["Pricing", "#pricing"],
      ["Log in", "/sign-in"],
      ["Get started", "/sign-up"],
    ]);

    await act(async () => must(sheet.querySelector("a")).click());
    expect(sheet.hidden).toBe(true);

    await act(async () => toggle.click());
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(sheet.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("gets its scrolled look once the page scrolls", async () => {
    await act(async () => root.render(<SiteNav />));
    const header = must(host.querySelector("header"));
    expect(header.dataset.scrolled).toBe("false");
    await act(async () => {
      Object.defineProperty(window, "scrollY", { value: 200, configurable: true });
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.dataset.scrolled).toBe("true");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("Reveal", () => {
  type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
  let fire: Callback = () => {};

  function setup(top: number, reduced = false) {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: Callback) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduced && query.includes("reduce"),
    }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top } as DOMRect);
  }

  afterEach(() => vi.restoreAllMocks());

  it("hides below-the-fold content until it scrolls into view", async () => {
    setup(5000);
    await act(async () => root.render(<Reveal>below</Reveal>));
    const el = must(host.querySelector<HTMLElement>("[data-reveal]"));
    expect(el.dataset.reveal).toBe("hidden");
    await act(async () => fire([{ isIntersecting: true }]));
    expect(el.dataset.reveal).toBe("shown");
  });

  it("never hides content already on screen", async () => {
    setup(100);
    await act(async () => root.render(<Reveal>above</Reveal>));
    expect(must(host.querySelector<HTMLElement>("[data-reveal]")).dataset.reveal).toBe("shown");
  });

  it("never hides anything under reduced motion", async () => {
    setup(5000, true);
    await act(async () => root.render(<Reveal>below</Reveal>));
    expect(must(host.querySelector<HTMLElement>("[data-reveal]")).dataset.reveal).toBe("shown");
  });
});

describe("openLandingChat", () => {
  function addLauncher(expanded: boolean) {
    const widget = document.createElement("chat-widget-host");
    const button = document.createElement("button");
    button.setAttribute("aria-expanded", String(expanded));
    widget.attachShadow({ mode: "open" }).append(button);
    document.body.append(widget);
    const click = vi.fn();
    button.addEventListener("click", click);
    return click;
  }

  it("does nothing before the widget loads", () => {
    expect(findLauncher()).toBeNull();
    expect(openLandingChat()).toBe(false);
  });

  it("clicks the closed launcher, and never closes an open panel", () => {
    const click = addLauncher(false);
    expect(openLandingChat()).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
    const clickOpen = addLauncher(true);
    expect(openLandingChat()).toBe(true);
    expect(clickOpen).not.toHaveBeenCalled();
  });
});

describe("OpenChatButton", () => {
  function addLauncher() {
    const widget = document.createElement("chat-widget-host");
    const button = document.createElement("button");
    button.setAttribute("aria-expanded", "false");
    const click = vi.fn();
    button.addEventListener("click", click);
    widget.attachShadow({ mode: "open" }).append(button);
    document.body.append(widget);
    return click;
  }

  it("remembers a click made before the widget loads, then opens the chat", async () => {
    await act(async () => root.render(<OpenChatButton />));
    const button = must(host.querySelector("button"));
    await act(async () => button.click());
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toContain("Loading the chat");

    let click = vi.fn();
    await act(async () => {
      click = addLauncher();
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the MutationObserver run
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(button.textContent).toContain("Open the chat");
  });

  it("gives up after the wait and says so", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => root.render(<OpenChatButton />));
      const button = must(host.querySelector("button"));
      await act(async () => button.click());
      await act(async () => vi.advanceTimersByTime(10_000));
      expect(host.textContent).toContain("The chat didn't load");
      expect(button.getAttribute("aria-busy")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("whenLauncherReady fires at once if the launcher is already there, and cancel stops it", () => {
    addLauncher();
    const ready = vi.fn();
    whenLauncherReady(ready, vi.fn());
    expect(ready).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
    const late = vi.fn();
    const cancel = whenLauncherReady(late, vi.fn());
    cancel();
    addLauncher();
    expect(late).not.toHaveBeenCalled();
  });
});
