import { describe, expect, it } from "vitest";
import * as fromIndex from "./index";
import {
  EMBED_PATH,
  EMBED_QUERY,
  isLoaderMessage,
  isPanelMessage,
  LOADER_MESSAGE_SOURCE,
  type LoaderMessage,
  PANEL_MESSAGE_SOURCE,
  type PanelMessage,
  WIDGET_SCRIPT_PATH,
} from "./embed";

const P = PANEL_MESSAGE_SOURCE;
const L = LOADER_MESSAGE_SOURCE;

const validPanel: PanelMessage[] = [
  { source: P, type: "ready" },
  { source: P, type: "close" },
  { source: P, type: "resize", height: 0 },
  { source: P, type: "resize", height: 480.5 },
  { source: P, type: "unread", count: 0 },
  { source: P, type: "unread", count: 3 },
];
const validLoader: LoaderMessage[] = [
  { source: L, type: "visibility", open: true },
  { source: L, type: "visibility", open: false },
];
const nonObjects: unknown[] = [null, undefined, "ready", 1, true, [], [P, "ready"], () => {}];

describe("constants", () => {
  it("match the spec", () => {
    expect(WIDGET_SCRIPT_PATH).toBe("/widget.js");
    expect(EMBED_PATH).toBe("/embed");
    expect(EMBED_QUERY).toEqual({ key: "key", origin: "origin" });
    expect(PANEL_MESSAGE_SOURCE).not.toBe(LOADER_MESSAGE_SOURCE);
  });
});

describe("isPanelMessage", () => {
  it.each(validPanel)("accepts %o", (msg) => expect(isPanelMessage(msg)).toBe(true));

  it.each([
    ["wrong source", { source: L, type: "close" }],
    ["missing source", { type: "close" }],
    ["unknown type", { source: P, type: "open" }],
    ["loader type", { source: P, type: "visibility", open: true }],
    ["missing type", { source: P }],
    ["resize without height", { source: P, type: "resize" }],
    ["negative height", { source: P, type: "resize", height: -1 }],
    ["NaN height", { source: P, type: "resize", height: Number.NaN }],
    ["infinite height", { source: P, type: "resize", height: Number.POSITIVE_INFINITY }],
    ["string height", { source: P, type: "resize", height: "400" }],
    ["unread without count", { source: P, type: "unread" }],
    ["negative count", { source: P, type: "unread", count: -1 }],
    ["NaN count", { source: P, type: "unread", count: Number.NaN }],
    ["fractional count", { source: P, type: "unread", count: 1.5 }],
    ["string count", { source: P, type: "unread", count: "2" }],
  ])("rejects %s", (_, msg) => expect(isPanelMessage(msg)).toBe(false));

  it.each(nonObjects)("rejects non-object %o", (data) => expect(isPanelMessage(data)).toBe(false));
});

describe("isLoaderMessage", () => {
  it.each(validLoader)("accepts %o", (msg) => expect(isLoaderMessage(msg)).toBe(true));

  it.each([
    ["wrong source", { source: P, type: "visibility", open: true }],
    ["missing source", { type: "visibility", open: true }],
    ["unknown type", { source: L, type: "close" }],
    ["missing open", { source: L, type: "visibility" }],
    ["non-boolean open", { source: L, type: "visibility", open: 1 }],
    ["string open", { source: L, type: "visibility", open: "true" }],
  ])("rejects %s", (_, msg) => expect(isLoaderMessage(msg)).toBe(false));

  it.each(nonObjects)("rejects non-object %o", (data) => expect(isLoaderMessage(data)).toBe(false));

  it("doesn't accept panel messages, and vice versa", () => {
    for (const msg of validPanel) expect(isLoaderMessage(msg)).toBe(false);
    for (const msg of validLoader) expect(isPanelMessage(msg)).toBe(false);
  });
});

describe("module", () => {
  it("is re-exported from the package index", () => {
    expect(fromIndex.isPanelMessage).toBe(isPanelMessage);
    expect(fromIndex.isLoaderMessage).toBe(isLoaderMessage);
    expect(fromIndex.EMBED_PATH).toBe(EMBED_PATH);
  });
});
