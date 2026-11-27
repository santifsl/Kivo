"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";

/** How long a click waits for the widget to load before giving up. */
export const LAUNCHER_WAIT_MS = 10_000;

/** The launcher the widget loader adds (an open shadow root with one button). */
export function findLauncher(doc: Document = document): HTMLButtonElement | null {
  return doc.querySelector("chat-widget-host")?.shadowRoot?.querySelector("button") ?? null;
}

/** Opens the real widget, as if the visitor clicked its corner button. Never closes it. */
export function openLandingChat(doc: Document = document): boolean {
  const launcher = findLauncher(doc);
  if (!launcher) return false;
  if (launcher.getAttribute("aria-expanded") !== "true") launcher.click();
  return true;
}

/**
 * Calls `onReady` once the launcher exists (now, or when the loader adds it), or `onTimeout`
 * after `ms`. Returns a cancel function.
 */
export function whenLauncherReady(
  onReady: () => void,
  onTimeout: () => void,
  ms = LAUNCHER_WAIT_MS,
  doc: Document = document,
): () => void {
  let done = false;
  const finish = (callback: () => void) => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearTimeout(timer);
    callback();
  };
  const check = () => findLauncher(doc) && finish(onReady);
  const observer = new MutationObserver(check);
  observer.observe(doc.body, { childList: true, subtree: true });
  const timer = setTimeout(() => finish(onTimeout), ms);
  check();
  return () => {
    done = true;
    observer.disconnect();
    clearTimeout(timer);
  };
}

/**
 * Opens the landing widget. A click before the widget has loaded isn't lost: the button shows
 * a spinner and opens the chat as soon as the launcher appears.
 */
export function OpenChatButton() {
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    return whenLauncherReady(
      () => {
        setWaiting(false);
        openLandingChat();
      },
      () => {
        setWaiting(false);
        setFailed(true);
      },
    );
  }, [waiting]);

  function open() {
    setFailed(false);
    if (!openLandingChat()) setWaiting(true);
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <Button className="h-12 px-6 text-base" loading={waiting} onClick={open}>
        {waiting ? null : (
          <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
        )}
        {waiting ? "Loading the chat…" : "Open the chat"}
      </Button>
      <p aria-live="polite" className="text-sm text-danger">
        {failed ? "The chat didn't load. Try again in a moment." : null}
      </p>
    </div>
  );
}
