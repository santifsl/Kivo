import type { ScriptProps } from "next/script";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_NAME, PLAN_LIMITS, PLAN_PRICES } from "@kivo/shared";
import { CHAT_MOCK } from "../components/landing/chat-card-mock";
import { HERO_SUBTEXT, TRUST_POINTS } from "../components/landing/hero";
import { STEPS } from "../components/landing/how-it-works";
import { DEMO_QUESTIONS } from "../components/landing/live-demo";
import { getPricingRows } from "../components/landing/pricing-data";
import { PRO_BADGE } from "../components/landing/pricing";
import { NAV_LINKS } from "../components/landing/site-nav";
import Home, { metadata } from "./page";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));
vi.mock("next/script", () => ({
  default: ({ src, strategy, "data-key": key }: ScriptProps & { "data-key": string }) => (
    <template data-widget-src={src} data-strategy={strategy} data-key={key} />
  ),
}));

async function renderHome() {
  return renderToStaticMarkup(await Home());
}

const escape = (text: string) => text.replaceAll("'", "&#x27;");

/** The attributes of the first <a> whose text starts with `text`. */
function link(html: string, text: string): Record<string, string> {
  const match = new RegExp(`<a ([^>]*)>${text}(?:<|$)`).exec(html);
  if (!match?.[1]) throw new Error(`no link "${text}"`);
  return Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
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
      "<header",
      'aria-labelledby="hero-title"',
      'id="how-it-works"',
      'id="grounded"',
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

  it("nav: logo, in-page links only, Log in and Get started pills", () => {
    const nav = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(nav).toContain(`aria-label="${APP_NAME}"`);
    for (const link of NAV_LINKS) {
      expect(link.href.startsWith("#")).toBe(true);
      expect(html).toContain(`id="${link.href.slice(1)}"`);
      expect(nav).toContain(`href="${link.href}"`);
    }
    expect(link(nav, "Log in")).toMatchObject({ href: "/sign-in", "data-variant": "secondary" });
    expect(link(nav, "Get started")).toMatchObject({ href: "/sign-up", "data-variant": "primary" });
    expect(nav).toContain('aria-label="Open menu"');
    expect(nav).toMatch(
      /data-testid="nav-sheet"[^>]*hidden=""|hidden=""[^>]*data-testid="nav-sheet"/,
    );
  });

  it("hero: eyebrow, serif headline with italic terracotta 'Nothing else.', subtext and CTAs", () => {
    expect(html).toContain("AI support grounded in your docs");
    expect(html).toMatch(
      /<h1 id="hero-title" class="font-display[^"]*">Support that answers from your docs\. <em class="block text-brand">Nothing else\.<\/em><\/h1>/,
    );
    expect(html).toContain(HERO_SUBTEXT);
    expect(HERO_SUBTEXT.startsWith(`${APP_NAME} is`)).toBe(true);
    expect(link(html, "Get started free")).toMatchObject({ href: "/sign-up" });
    if (widgetKey) expect(link(html, "See it in action")).toMatchObject({ href: "#demo" });
    else expect(html).not.toContain("See it in action");
  });

  it("hero trust row lists only the three backed claims", () => {
    for (const point of TRUST_POINTS) expect(html).toContain(escape(point.label));
    expect(TRUST_POINTS.map((p) => p.label)).toEqual([
      "Answers only from your docs",
      "One script tag to install",
      "Says “I don't know” instead of guessing",
    ]);
  });

  it("chat card mock: Online dot, the exchange, a fake input, and no source chips", () => {
    const start = html.indexOf("<figure");
    const card = html.slice(start, html.indexOf("</figure>", start));
    expect(card).toContain('data-testid="online-dot"');
    expect(card).toContain("Online");
    expect(card).toContain(CHAT_MOCK.question);
    expect(card).toContain(escape(CHAT_MOCK.answer));
    expect(card).toContain("Ask a question…");
    expect(card).not.toMatch(/<input|<textarea|<button/);
    expect(card).not.toMatch(/\bsources?\b|citation/i);
  });

  it("how it works: three steps with real copy", () => {
    expect(STEPS.map((s) => s.title)).toEqual([
      "Add your knowledge",
      "Install the widget",
      "Answer instantly",
    ]);
    for (const step of STEPS) expect(html).toContain(step.title);
    expect(html).toContain("PDF, Markdown or text");
    expect(html).toContain("one script tag");
    expect(html).toContain("24/7");
  });

  it("grounded answers card", () => {
    expect(html).toContain("From docs to answers");
    expect(html).toContain("Answers grounded in your documents.");
    expect(html).toContain('data-testid="highlight-line"');
  });

  it("live demo: prompt, suggested questions and the real widget, only with a key", () => {
    for (const q of DEMO_QUESTIONS) expect(html.includes(q)).toBe(Boolean(widgetKey));
    expect(html.includes("Open the chat")).toBe(Boolean(widgetKey));
  });

  it("Pro is highlighted with a terracotta hairline and the badge", () => {
    expect(planCard(html, "pro")).toContain(PRO_BADGE);
    expect(planCard(html, "free")).not.toContain(PRO_BADGE);
    expect(html).toMatch(/<section[^>]*class="[^"]*outline-brand[^"]*"[^>]*data-plan="pro"/);
  });

  it("everything renders visible: no Reveal starts hidden on the server", () => {
    expect(html).toContain('data-reveal="shown"');
    expect(html).not.toContain('data-reveal="hidden"');
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
