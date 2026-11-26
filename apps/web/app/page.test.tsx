import type { ScriptProps } from "next/script";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_NAME, PLAN_LIMITS, PLAN_PRICES } from "@kivo/shared";
import { getPricingRows } from "../components/landing/pricing-data";
import Home, { metadata } from "./page";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/script", () => ({
  default: ({ src, strategy, "data-key": key }: ScriptProps & { "data-key": string }) => (
    <template data-widget-src={src} data-strategy={strategy} data-key={key} />
  ),
}));

async function renderHome() {
  return renderToStaticMarkup(await Home());
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

function planCard(html: string, plan: "free" | "pro"): string {
  const match = html.match(
    new RegExp(`<section[^>]*data-plan="${plan}"[^>]*>([\\s\\S]*?)</section>`),
  );
  if (!match?.[1]) throw new Error(`no ${plan} card`);
  return match[1];
}

afterEach(() => vi.unstubAllEnvs());

describe.each([undefined, "pk_landing_test_fixture"])("landing page with key %s", (widgetKey) => {
  let html: string;

  beforeEach(async () => {
    vi.stubEnv("LANDING_WIDGET_KEY", widgetKey);
    html = await renderHome();
  });

  it("shows APP_NAME and uses it in the title and description", () => {
    expect(html).toContain(APP_NAME);
    expect(String(metadata.title)).toContain(APP_NAME);
    expect(metadata.description).toContain(APP_NAME);
  });

  it("renders the sections in order", () => {
    const order = [
      "hero-title",
      "how-it-works",
      ...(widgetKey ? ['id="demo"'] : []),
      'id="pricing"',
      'id="install"',
      "<footer",
    ];
    const positions = order.map((marker) => html.indexOf(marker));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("has a Start free CTA linking to /sign-up", () => {
    expect(html).toMatch(/<a[^>]*href="\/sign-up"[^>]*>Start free<\/a>/);
  });

  it("is dark: wrapped in the .theme-dark token scope", () => {
    expect(html).toMatch(/^<div class="theme-dark /);
  });

  it("prices come from PLAN_PRICES, with Pro at $9/month", () => {
    expect(PLAN_PRICES.pro).toBe(9);
    expect(planCard(html, "pro")).toContain(`$${PLAN_PRICES.pro}</span>`);
    expect(planCard(html, "free")).toContain(`$${PLAN_PRICES.free}</span>`);
    expect(planCard(html, "pro")).toContain("/month");
  });

  it("each plan card shows its PLAN_LIMITS values", () => {
    for (const plan of ["free", "pro"] as const) {
      const card = planCard(html, plan);
      const limits = PLAN_LIMITS[plan];
      for (const value of [limits.projects, limits.messagesPerMonth, limits.knowledgeSources]) {
        expect(card).toContain(`<dd class="text-right font-medium text-ink">${fmt(value)}</dd>`);
      }
    }
  });

  it("shows every §5 row on both cards", () => {
    const rows = getPricingRows();
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(planCard(html, "free")).toContain(row.free);
      expect(planCard(html, "pro")).toContain(row.pro);
    }
  });

  it("shows the install snippet and a copy button", () => {
    expect(html).toContain("widget.js");
    expect(html).toContain("data-key=");
    expect(html).toContain('aria-label="Copy snippet"');
  });

  it("renders a sign-in link in the footer", () => {
    expect(html).toMatch(/<a[^>]*href="\/sign-in"/);
    expect(html).toContain(`© ${new Date().getFullYear()} ${APP_NAME}`);
  });
});

it("loads the widget with the project key read on each request", async () => {
  const fixtureKey = "pk_landing_test_fixture";
  vi.stubEnv("LANDING_WIDGET_KEY", ` ${fixtureKey} `);
  const html = await renderHome();
  expect(html).toContain('id="demo"');
  expect(html).toContain(
    `data-widget-src="/widget.js" data-strategy="afterInteractive" data-key="${fixtureKey}"`,
  );

  for (const missingKey of [undefined, "   "]) {
    vi.stubEnv("LANDING_WIDGET_KEY", missingKey);
    const unconfiguredHtml = await renderHome();
    expect(unconfiguredHtml).not.toContain('id="demo"');
    expect(unconfiguredHtml).not.toContain('href="#demo"');
    expect(unconfiguredHtml).not.toContain('data-widget-src="/widget.js"');
  }
});
