// Tests for app/opengraph-image.tsx and app/apple-icon.tsx. They live here because
// components/brand/** is where URK-T03's files go.
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@kivo/shared";
import { BRAND_COLORS } from "./colors";
import { K_PATHS } from "./k-mark";

type Captured = {
  element: ReactElement;
  options: { width: number; height: number; fonts?: unknown[] };
};
const captured: Captured[] = [];

vi.mock("next/og", () => ({
  // Called with `new`, so a plain function (not an arrow) records what the route built.
  ImageResponse: vi.fn(function (element: ReactElement, options: Captured["options"]) {
    captured.push({ element, options });
  }),
}));

const {
  default: OpengraphImage,
  alt,
  size: ogSize,
  contentType: ogType,
} = await import("../../app/opengraph-image");
const {
  default: AppleIcon,
  size: appleSize,
  contentType: appleType,
} = await import("../../app/apple-icon");

const FONT_CSS = "@font-face { src: url(https://fonts.gstatic.com/x.ttf) format('truetype'); }";

function last(): Captured {
  const c = captured.at(-1);
  if (!c || !isValidElement(c.element)) throw new Error("ImageResponse was not built");
  return c;
}

beforeEach(() => {
  captured.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("opengraph-image", () => {
  it("exports 1200×630 PNG metadata with alt text", () => {
    expect(ogSize).toEqual({ width: 1200, height: 630 });
    expect(ogType).toBe("image/png");
    expect(alt).toBe(`${APP_NAME}: Support that answers from your docs.`);
  });

  it("draws the K and the line, with 'your docs' in terracotta italic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await OpengraphImage();
    const html = renderToStaticMarkup(last().element);
    for (const d of K_PATHS) expect(html).toContain(`d="${d}"`);
    expect(html).toContain("Support that answers from ");
    expect(html).toMatch(
      new RegExp(`color:${BRAND_COLORS.terracotta};font-style:italic">your docs</span>`),
    );
    expect(html).toContain(`background:${BRAND_COLORS.ink}`);
    expect(html).toContain("font-family:Instrument Serif, Georgia, serif");
  });

  it("loads Instrument Serif regular and italic, subset to the line", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://fonts.googleapis.com")
        ? new Response(FONT_CSS)
        : new Response(new Uint8Array([1, 2, 3])),
    );
    vi.stubGlobal("fetch", fetchMock);
    await OpengraphImage();
    const { options } = last();
    expect(options).toMatchObject({ width: 1200, height: 630 });
    expect(options.fonts).toEqual([
      expect.objectContaining({ name: "Instrument Serif", style: "normal", weight: 400 }),
      expect.objectContaining({ name: "Instrument Serif", style: "italic", weight: 400 }),
    ]);
    const cssUrls = fetchMock.mock.calls.map(([u]) => u).filter((u) => u.includes("googleapis"));
    expect(cssUrls).toHaveLength(2);
    expect(cssUrls.some((u) => u.includes("ital@1"))).toBe(true);
    expect(cssUrls[0]).toContain(
      `text=${encodeURIComponent("Support that answers from your docs.")}`,
    );
  });

  it.each([
    ["the network fails", () => Promise.reject(new Error("offline"))],
    ["the CSS has no font URL", async () => new Response("/* nothing */")],
    [
      "the font file 404s",
      async (url: string) =>
        url.startsWith("https://fonts.googleapis.com")
          ? new Response(FONT_CSS)
          : new Response("", { status: 404 }),
    ],
  ])("falls back to the built-in font when %s", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(OpengraphImage()).resolves.toBeDefined();
    expect(last().options.fonts).toEqual([]);
  });
});

describe("apple-icon", () => {
  it("is a 180px PNG: the paper K on a full-bleed ink square", () => {
    expect(appleSize).toEqual({ width: 180, height: 180 });
    expect(appleType).toBe("image/png");
    AppleIcon();
    const { element, options } = last();
    expect(options).toEqual({ width: 180, height: 180 });
    const html = renderToStaticMarkup(element);
    expect(html).toContain(`background:${BRAND_COLORS.ink}`);
    expect(html).toContain(`fill="${BRAND_COLORS.paper}"`);
    for (const d of K_PATHS) expect(html).toContain(`d="${d}"`);
  });
});
