"use client";

import type { WidgetConfig, WidgetConfigResponse } from "@kivo/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { sendChatMessage } from "../../lib/embed/chat-api";
import { chatReducer, INITIAL_CHAT_STATE } from "../../lib/embed/chat-state";
import {
  createPanelMessenger,
  type OutgoingMessage,
  type PanelMessenger,
} from "../../lib/embed/messenger";
import { randomId } from "../../lib/embed/random-id";
import { getVisitorId } from "../../lib/embed/visitor-id";
import { FALLBACK_HEADER, PanelView } from "./panel-view";

export type EmbedAppProps = {
  /** The `key` query param, already format-checked (null when missing or invalid). */
  publicKey: string | null;
  /** The validated host origin (null → standalone: no postMessage at all). */
  hostOrigin: string | null;
};

type ConfigState =
  { phase: "loading" } | { phase: "error" } | { phase: "ready"; config: WidgetConfig };

/** The chat panel at /embed: loads the config, runs the chat, talks to the loader. */
export function EmbedApp({ publicKey, hostOrigin }: EmbedAppProps) {
  const [configState, setConfigState] = useState<ConfigState>(
    publicKey ? { phase: "loading" } : { phase: "error" },
  );
  const [attempt, setAttempt] = useState(0);
  const [chat, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messengerRef = useRef<PanelMessenger | null>(null);
  // Embedded panels start hidden until the loader says otherwise; standalone ones are visible.
  const visibleRef = useRef(hostOrigin === null);
  const unreadRef = useRef(0);

  const post = useCallback((message: OutgoingMessage) => messengerRef.current?.post(message), []);

  // Config.
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    fetch(`/api/widget/config?key=${encodeURIComponent(publicKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`config ${res.status}`);
        const body = (await res.json()) as WidgetConfigResponse;
        if (!cancelled) setConfigState({ phase: "ready", config: body.config });
      })
      .catch(() => {
        if (!cancelled) setConfigState({ phase: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, attempt]);

  // Loader channel: `ready` once, then react to `visibility`.
  useEffect(() => {
    const messenger = createPanelMessenger({
      hostOrigin,
      parent: window.parent === window ? null : window.parent,
      listenOn: window,
      onMessage: (message) => {
        visibleRef.current = message.open;
        if (message.open) {
          inputRef.current?.focus();
          if (unreadRef.current > 0) {
            unreadRef.current = 0;
            messenger.post({ type: "unread", count: 0 });
          }
        }
      },
    });
    messengerRef.current = messenger;
    messenger.post({ type: "ready" });
    return () => {
      messenger.dispose();
      messengerRef.current = null;
    };
  }, [hostOrigin]);

  // Escape inside the iframe closes the panel (the loader only sees host-page keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") post({ type: "close" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post]);

  // Focus the input when the chat is first shown standalone.
  useEffect(() => {
    if (configState.phase === "ready" && visibleRef.current) inputRef.current?.focus();
  }, [configState.phase]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !publicKey || chat.status === "typing") return;
    setDraft("");
    dispatch({ type: "send", id: randomId(), text });
    const result = await sendChatMessage({
      key: publicKey,
      visitorId: getVisitorId(),
      message: text,
      ...(chat.conversationId ? { conversationId: chat.conversationId } : {}),
    });
    if (!result.ok) {
      dispatch({ type: "fail", error: result.error });
      return;
    }
    dispatch({
      type: "reply",
      id: randomId(),
      text: result.data.reply,
      conversationId: result.data.conversationId,
    });
    if (!visibleRef.current) {
      unreadRef.current += 1;
      post({ type: "unread", count: unreadRef.current });
    }
  };

  const config = configState.phase === "ready" ? configState.config : null;
  return (
    <PanelView
      phase={configState.phase}
      headerText={config?.header_text ?? FALLBACK_HEADER}
      showBadge={config?.show_badge ?? false}
      messages={chat.messages}
      typing={chat.status === "typing"}
      error={chat.error}
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={() => void send()}
      onClose={() => post({ type: "close" })}
      onRetry={() => {
        if (!publicKey) return;
        setConfigState({ phase: "loading" });
        setAttempt((n) => n + 1);
      }}
      inputRef={inputRef}
    />
  );
}
