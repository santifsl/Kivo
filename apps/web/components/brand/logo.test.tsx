import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@kivo/shared";
import { K_PATHS, KivoAppMark, KivoLogo, KivoMark, type BrandTone } from "./logo";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));

const TONES: BrandTone[] = ["ink", "paper"];

describe.each(TONES)("brand logo, tone %s", (tone) => {
  it("KivoMark is one image named after the app", () => {
    const html = renderToStaticMarkup(<KivoMark tone={tone} />);
    expect(html).toMatch(new RegExp(`^<svg role="img" aria-label="${APP_NAME}"`));
    expect(html).toContain(`data-tone="${tone}"`);
    for (const d of K_PATHS) expect(html).toContain(`d="${d}"`);
  });

  it("KivoLogo names the whole lockup once and hides its parts", () => {
    const html = renderToStaticMarkup(<KivoLogo tone={tone} />);
    expect(html.match(/role="img"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`^<span role="img" aria-label="${APP_NAME}"`));
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toMatch(/<svg aria-hidden="true"/);
    expect(html).toMatch(new RegExp(`<span aria-hidden="true" class="[^"]*">${APP_NAME}</span>`));
  });

  it("the app-mark variant puts the K on a tile", () => {
    const html = renderToStaticMarkup(<KivoAppMark tone={tone} />);
    expect(html).toMatch(new RegExp(`^<svg role="img" aria-label="${APP_NAME}"`));
    expect(html).toMatch(/<rect width="32" height="32" rx="7.5"/);
    expect(renderToStaticMarkup(<KivoLogo tone={tone} variant="app-mark" />)).toContain("<rect");
  });
});

it("tones differ", () => {
  expect(renderToStaticMarkup(<KivoMark tone="ink" />)).not.toEqual(
    renderToStaticMarkup(<KivoMark tone="paper" />),
  );
});

it("the favicon draws the same K as the logo", () => {
  const icon = readFileSync(join(import.meta.dirname, "../../app/icon.svg"), "utf8");
  for (const d of K_PATHS) expect(icon).toContain(`d="${d}"`);
});
