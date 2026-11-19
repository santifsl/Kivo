import {
  isLoaderMessage,
  PANEL_MESSAGE_SOURCE,
  type LoaderMessage,
  type PanelMessage,
} from "@kivo/shared/embed";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A panel → loader message without its `source` tag (added by `post`). */
export type OutgoingMessage = DistributiveOmit<PanelMessage, "source">;

export type PanelMessengerOptions = {
  /** The host page's origin (validated `origin` param). null → never post, never accept. */
  hostOrigin: string | null;
  /** Where messages go: `window.parent`. */
  parent: Pick<Window, "postMessage"> | null;
  /** Where messages arrive: `window`. */
  listenOn: Pick<Window, "addEventListener" | "removeEventListener">;
  onMessage: (message: LoaderMessage) => void;
};

export type PanelMessenger = {
  post: (message: OutgoingMessage) => void;
  dispose: () => void;
};

/**
 * postMessage channel to the widget loader (docs/project.md §9 "postMessage").
 * Posts only to `hostOrigin`, never "*". Accepts a message only when it comes
 * from `hostOrigin` and from the parent window, and `isLoaderMessage` passes.
 */
export function createPanelMessenger({
  hostOrigin,
  parent,
  listenOn,
  onMessage,
}: PanelMessengerOptions): PanelMessenger {
  const listener = (event: Event) => {
    const e = event as MessageEvent;
    if (!hostOrigin || e.origin !== hostOrigin || !parent || e.source !== parent) return;
    const data: unknown = e.data;
    if (isLoaderMessage(data)) onMessage(data);
  };
  listenOn.addEventListener("message", listener);

  return {
    post(message) {
      if (!hostOrigin || !parent) return;
      parent.postMessage({ ...message, source: PANEL_MESSAGE_SOURCE }, hostOrigin);
    },
    dispose() {
      listenOn.removeEventListener("message", listener);
    },
  };
}
