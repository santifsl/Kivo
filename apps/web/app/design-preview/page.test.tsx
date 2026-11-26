import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@kivo/shared";
import { DIRECTIONS } from "./directions";
import DesignPreviewPage from "./page";

async function render(dir?: string) {
  const page = await DesignPreviewPage({ searchParams: Promise.resolve(dir ? { dir } : {}) });
  return renderToStaticMarkup(page);
}

describe("/design-preview", () => {
  it.each(DIRECTIONS.map(({ id }) => id))("renders all five surfaces for %s", async (id) => {
    const html = await render(id);
    expect(html).toContain(`data-dir="${id}"`);
    for (const frame of [1, 2, 3, 4, 5]) expect(html).toContain(`id="frame-${frame}"`);
    expect(html).toContain("38 / 100");
    expect(html).toContain("Resets Dec 1");
    expect(html).toContain("How can we help?");
  });

  it("links one tab per direction and marks the current one", async () => {
    const html = await render("glass");
    for (const { id } of DIRECTIONS) expect(html).toContain(`href="/design-preview?dir=${id}"`);
    expect(html).toMatch(/aria-current="page"[^>]*>B · Graphite glass/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("defaults to C+B and uses the lowercase serif wordmark there", async () => {
    const html = await render();
    expect(html).toContain('data-dir="cb"');
    expect(html).toContain(`>${APP_NAME.toLowerCase()}<`);
  });

  it("uses APP_NAME as the wordmark in Ink", async () => {
    expect(await render("ink")).toContain(`>${APP_NAME}<`);
  });
});
