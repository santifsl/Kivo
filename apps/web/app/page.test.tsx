import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_NAME, PLAN_LIMITS, PLAN_PRICES } from "@kivo/shared";
import { getPricingRows } from "../components/landing/pricing-data";
import Home, { metadata } from "./page";

const html = renderToStaticMarkup(<Home />);
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** The HTML inside one plan card. */
function planCard(plan: "free" | "pro"): string {
  const match = html.match(new RegExp(`<section[^>]*data-plan="${plan}"[^>]*>([\\s\\S]*?)</section>`));
  if (!match?.[1]) throw new Error(`no ${plan} card`);
  return match[1];
}

describe("landing page", () => {
  it("shows APP_NAME and uses it in the title and description", () => {
    expect(html).toContain(APP_NAME);
    expect(String(metadata.title)).toContain(APP_NAME);
    expect(metadata.description).toContain(APP_NAME);
  });

  it("renders the six sections in order", () => {
    const order = ["hero-title", "how-it-works", 'id="demo"', 'id="pricing"', 'id="install"', "<footer"];
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
    expect(planCard("pro")).toContain(`$${PLAN_PRICES.pro}</span>`);
    expect(planCard("free")).toContain(`$${PLAN_PRICES.free}</span>`);
    expect(planCard("pro")).toContain("/month");
  });

  it("each plan card shows its PLAN_LIMITS values", () => {
    for (const plan of ["free", "pro"] as const) {
      const card = planCard(plan);
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
      expect(planCard("free")).toContain(row.free);
      expect(planCard("pro")).toContain(row.pro);
    }
  });

  it("shows the install snippet and a copy button", () => {
    expect(html).toContain("widget.js");
    expect(html).toContain("data-key=");
    expect(html).toContain('aria-label="Copy snippet"');
  });

  it("renders the demo chat as text, with a sign-in link in the footer", () => {
    expect(html).toContain("Can I use it on a Shopify store?");
    expect(html).toMatch(/<a[^>]*href="\/sign-in"/);
    expect(html).toContain(`© ${new Date().getFullYear()} ${APP_NAME}`);
  });
});
