"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "../ui/button";

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

export function OpenChatButton() {
  return (
    <Button className="h-12 px-6 text-base" onClick={() => openLandingChat()}>
      <MessageCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />
      Open the chat
    </Button>
  );
}
