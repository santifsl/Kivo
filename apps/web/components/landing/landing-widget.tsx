"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

let launcher: HTMLElement | null = null;
let container: HTMLDivElement | null = null;
let watching = false;

function placeLauncher() {
  if (!launcher) return;
  if (container?.isConnected) container.append(launcher);
  else launcher.remove();
}

function watchForLauncher() {
  if (watching) return;
  watching = true;

  // The loader adds the host to body after fetching config. Move it under
  // the landing page so client navigation removes it with the rest of the page.
  const adoptLauncher = () => {
    launcher = document.querySelector<HTMLElement>("body > chat-widget-host");
    if (!launcher) return;
    observer.disconnect();
    placeLauncher();
  };
  const observer = new MutationObserver(adoptLauncher);
  observer.observe(document.body, { childList: true });
  adoptLauncher();
}

export function LandingWidget({ widgetKey }: { widgetKey: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    container = containerRef.current;
    // Next's Script runs once per document, so reuse the launcher on return.
    if (launcher) placeLauncher();
    else watchForLauncher();
    return () => {
      container = null;
    };
  }, []);

  return (
    <div ref={containerRef} className="contents">
      <Script src="/widget.js" data-key={widgetKey} strategy="afterInteractive" />
    </div>
  );
}
