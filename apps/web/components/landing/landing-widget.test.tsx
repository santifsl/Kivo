// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LandingWidget } from "./landing-widget";

it("keeps the launcher on the landing page even when widget config arrives after navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const widgetKey = "pk_landing_test_fixture";
  const showLanding = () => act(async () => root.render(<LandingWidget widgetKey={widgetKey} />));
  const leaveLanding = () => act(async () => root.render(<main>Sign up</main>));
  const scriptSelector = 'script[src="/widget.js"]';
  const launcherTag = "chat-widget-host";

  try {
    await showLanding();
    const script = document.querySelector(scriptSelector);
    expect(script?.getAttribute("data-key")).toBe(widgetKey);
    script?.dispatchEvent(new Event("load"));

    // The script has loaded, but its asynchronous config request is still pending.
    await leaveLanding();
    const launcher = document.createElement(launcherTag);
    await act(async () => document.body.append(launcher));
    expect(document.querySelector(launcherTag)).toBeNull();

    await showLanding();
    expect(container.querySelector(launcherTag)).toBe(launcher);

    await leaveLanding();
    expect(document.querySelector(launcherTag)).toBeNull();

    await showLanding();
    expect(container.querySelector(launcherTag)).toBe(launcher);
    expect(Array.from(document.querySelectorAll(scriptSelector))).toEqual([script]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    document.querySelector(scriptSelector)?.remove();
    vi.unstubAllGlobals();
  }
});
