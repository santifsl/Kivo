import type { MessageRole } from "@kivo/shared";

export type ChatMessage = { id: string; role: MessageRole; text: string };

export type ChatState = {
  messages: ChatMessage[];
  /** "typing": waiting for the bot's reply. */
  status: "idle" | "typing";
  conversationId: string | null;
  /** Friendly error from the last send, cleared by the next one. */
  error: string | null;
};

export type ChatAction =
  | { type: "send"; id: string; text: string }
  | { type: "reply"; id: string; text: string; conversationId: string }
  | { type: "fail"; error: string };

export const INITIAL_CHAT_STATE: ChatState = {
  messages: [],
  status: "idle",
  conversationId: null,
  error: null,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return {
        ...state,
        messages: [...state.messages, { id: action.id, role: "visitor", text: action.text }],
        status: "typing",
        error: null,
      };
    case "reply":
      return {
        ...state,
        messages: [...state.messages, { id: action.id, role: "bot", text: action.text }],
        status: "idle",
        conversationId: action.conversationId,
      };
    case "fail":
      return { ...state, status: "idle", error: action.error };
  }
}
