// node e2e/redesign-audit.ts <preview-url>
//
// The redesign's visual QA (URK-T09). Screenshots every screen in light and dark at 375, 768
// and 1440 (the landing is always dark: once per width), and checks each one for:
//   - horizontal overflow (scrollWidth vs. viewport, and the elements that stick out)
//   - text contrast, WCAG AA (4.5:1, or 3:1 for large text)
//   - content stuck invisible after scrolling through the page
//   - keyboard focus: every Tab stop must look different focused vs. blurred
//   - reduced motion: no running animations or hidden reveals with `prefers-reduced-motion`
// Also: Conversations empty and with a thread (one bot avatar per message, per theme), and
// Customize and Billing again as Pro after a Clerk test-card checkout (375 and 1440).
//
// Uses a disposable +clerk_test owner (Clerk test mode) and deletes it, with its Supabase
// account, projects and files, at the end. One OpenAI call (the widget question for a thread).
//
// Needs the same variables as e2e:core. Output: e2e/screenshots/redesign/ (PNGs + report.json).

import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  allowPreview,
  askWidget,
  checkout,
  cleanSupabase,
  copySnippet,
  createProject,
  deleteOwner,
  openExternalPage,
  previewOrigin,
  serveHtml,
  signUp,
  uploadPdf,
  waitForPro,
} from "./helpers.ts";
import { contrastRatio, parseColor, terracottaChecks } from "./audit-color.ts";

const origin = previewOrigin(process.argv[2], "Usage: node e2e/redesign-audit.ts <preview-url>");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const clerkSecret = process.env.CLERK_SECRET_KEY ?? "";
assert(clerkSecret.startsWith("sk_"), "CLERK_SECRET_KEY is required.");
const admin = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  secret: process.env.SUPABASE_SECRET_KEY,
};

const OUT = fileURLToPath(new URL("./screenshots/redesign/", import.meta.url));
const WIDTHS = [375, 768, 1440] as const;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
type Width = (typeof WIDTHS)[number];

type Finding = {
  page: string;
  theme: Theme | "-";
  width: Width | "-";
  check: string;
  detail: string;
};
const findings: Finding[] = [];
const shots: string[] = [];
const notes: string[] = [];

// ---------------------------------------------------------------------------
// In-page checks (run in the browser; must be self-contained)
// ---------------------------------------------------------------------------

type PageReport = {
  overflow: { scrollWidth: number; viewport: number; offenders: string[] };
  invisible: string[];
  contrast: Array<{
    text: string;
    fg: string;
    bg: string;
    ratio: number;
    min: number;
    where: string;
  }>;
  unknownColors: number;
};

/** Everything here runs inside the page, so helpers are inlined. */
function inPageChecks(): PageReport {
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}` : "";
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  const vw = document.documentElement.clientWidth;

  // Overflow: elements whose box sticks out past the viewport on the right.
  const offenders: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= vw + 1) continue;
    // Ignore children of something that clips them (overflow hidden/clip, or a scroll box).
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o !== "visible" && p.getBoundingClientRect().right <= vw + 1) {
        clipped = true;
        break;
      }
    }
    if (!clipped && offenders.length < 8)
      offenders.push(`${describe(el)} right=${Math.round(r.right)}`);
  }

  const rgba = (value: string): [number, number, number, number] | null => {
    const m = /^rgba?\(([^)]+)\)$/.exec(value);
    if (m?.[1]) {
      const parts = m[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    }
    const c = /^color\(srgb ([^)]+)\)$/.exec(value);
    if (c?.[1]) {
      const parts = c[1]
        .split(/[\s/]+/)
        .filter(Boolean)
        .map(Number);
      return [(parts[0] ?? 0) * 255, (parts[1] ?? 0) * 255, (parts[2] ?? 0) * 255, parts[3] ?? 1];
    }
    return null;
  };
  const over = (top: number[], bottom: number[]) => {
    const a = top[3] ?? 1;
    return [0, 1, 2].map((i) => (top[i] ?? 0) * a + (bottom[i] ?? 0) * (1 - a)).concat(1);
  };
  const lum = (c: number[]) => {
    const ch = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(c[0] ?? 0) + 0.7152 * ch(c[1] ?? 0) + 0.0722 * ch(c[2] ?? 0);
  };
  const ratio = (a: number[], b: number[]) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return ((l1 ?? 0) + 0.05) / ((l2 ?? 0) + 0.05);
  };

  const invisible: string[] = [];
  const contrast: PageReport["contrast"] = [];
  let unknownColors = 0;
  const seen = new Set<string>();

  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (!ownText) continue;
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (style.display === "none" || r.width < 2 || r.height < 2) continue;
    if (el.closest("[aria-hidden='true'], [hidden], noscript, script, style, template")) continue;
    // Screen-reader-only text (clipped to 1px) isn't visual.
    if (style.position === "absolute" && (r.width <= 1 || style.clip.startsWith("rect(0")))
      continue;

    // Opacity through the ancestors.
    let opacity = 1;
    for (let p: Element | null = el; p; p = p.parentElement)
      opacity *= Number(getComputedStyle(p).opacity);
    if (opacity < 0.05 || style.visibility === "hidden") {
      if (invisible.length < 10) invisible.push(describe(el));
      continue;
    }

    // Disabled controls are exempt from contrast (WCAG 1.4.3).
    if (el.closest("[disabled], [aria-disabled='true']")) continue;

    const fg = rgba(style.color);
    if (!fg) {
      unknownColors++;
      continue;
    }
    // Background: stack ancestors' background colors from the first opaque one up to the element.
    const layers: number[][] = [];
    let imageBehind = false;
    for (let p: Element | null = el; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.backgroundImage !== "none") imageBehind = true;
      const bg = rgba(ps.backgroundColor);
      if (bg === null) {
        unknownColors++;
        break;
      }
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 1) break;
    }
    let bg = [255, 255, 255, 1];
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const text = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const size = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    const value = ratio(text, bg);
    if (value + 0.005 < min) {
      const key = `${ownText.slice(0, 30)}|${style.color}|${bg.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contrast.push({
        text: ownText.slice(0, 50),
        fg: style.color,
        bg: `rgb(${bg.slice(0, 3).map(Math.round).join(", ")})${imageBehind ? " +image" : ""}`,
        ratio: Math.round(value * 100) / 100,
        min,
        where: describe(el).slice(0, 90),
      });
    }
  }
  for (const el of Array.from(document.querySelectorAll('[data-reveal="hidden"]'))) {
    if (invisible.length < 10) invisible.push(`data-reveal=hidden: ${describe(el)}`);
  }
  return {
    overflow: { scrollWidth: document.documentElement.scrollWidth, viewport: vw, offenders },
    invisible,
    contrast,
    unknownColors,
  };
}

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

async function context(
  browser: Browser,
  options: { theme: Theme; width: number; storageState?: string; reducedMotion?: "reduce" },
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: options.width, height: options.width < 768 ? 812 : 900 },
    isMobile: options.width < 768,
    hasTouch: options.width < 768,
    colorScheme: options.theme,
    reducedMotion: options.reducedMotion ?? "no-preference",
    serviceWorkers: "block",
    storageState: options.storageState,
  });
  ctx.setDefaultTimeout(30_000);
  await allowPreview(ctx, origin, bypass);
  await setupClerkTestingToken({ context: ctx });
  return ctx;
}

/** Scrolls to the bottom in steps (so every reveal fires), then back to the top. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

type Screen = {
  name: string;
  path: string;
  /** Waits for the screen's real content (not a loading state). */
  ready: (page: Page) => Promise<unknown>;
  signedIn: boolean;
  /** The landing page is always dark: shoot it once per width. */
  darkOnly?: boolean;
};

async function audit(page: Page, screen: Screen, theme: Theme | "-", width: Width) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await page.goto(`${origin}${screen.path}`, { waitUntil: "domcontentloaded" });
  assert(response?.ok(), `${screen.path} returned HTTP ${response?.status()}`);
  await screen.ready(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await scrollThrough(page);
  const file = `${width}-${theme === "-" ? "dark" : theme}-${screen.name}.png`;
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true });
  shots.push(file);
  const report = await page.evaluate(inPageChecks);
  const add = (check: string, detail: string) =>
    findings.push({ page: screen.name, theme, width, check, detail });
  if (report.overflow.scrollWidth > report.overflow.viewport) {
    add(
      "overflow",
      `scrollWidth ${report.overflow.scrollWidth} > ${report.overflow.viewport}: ${report.overflow.offenders.join("; ")}`,
    );
  }
  for (const item of report.invisible) add("invisible", item);
  for (const c of report.contrast) {
    add("contrast", `${c.ratio}:1 < ${c.min}:1 — "${c.text}" ${c.fg} on ${c.bg} (${c.where})`);
  }
  if (report.unknownColors)
    notes.push(`${screen.name} ${theme} ${width}: ${report.unknownColors} colors not parsed`);
  for (const e of errors) add("page-error", e);
  console.log(
    `  ${screen.name} ${theme} ${width}: overflow ${report.overflow.scrollWidth > report.overflow.viewport ? "YES" : "no"}, ` +
      `contrast ${report.contrast.length}, invisible ${report.invisible.length}`,
  );
}

/** Tabs through the page; every focused element must look different from its blurred self. */
async function checkFocus(page: Page, screen: Screen, theme: Theme) {
  await page.goto(`${origin}${screen.path}`, { waitUntil: "domcontentloaded" });
  await screen.ready(page);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const missing = new Set<string>();
  let stops = 0;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      let el = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      if (!el || el === document.body) return { done: true as const };
      if (el.tagName === "IFRAME") return { done: false as const, skip: true, label: "iframe" };
      const label = `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
      const snap = () => {
        const s = getComputedStyle(el as Element);
        return [
          s.outlineStyle,
          s.outlineWidth,
          s.outlineColor,
          s.boxShadow,
          s.borderColor,
          s.backgroundColor,
          s.textDecorationLine,
          s.color,
        ].join("|");
      };
      const focused = snap();
      const visible = (el as Element).matches(":focus-visible");
      (el as HTMLElement).blur();
      const blurred = snap();
      (el as HTMLElement).focus();
      return { done: false as const, skip: false, label, changed: focused !== blurred, visible };
    });
    if (result.done) break;
    stops++;
    if (!result.skip && !result.changed) missing.add(result.label);
  }
  for (const label of missing) {
    findings.push({
      page: screen.name,
      theme,
      width: 1440,
      check: "focus",
      detail: `no visible focus change: ${label}`,
    });
  }
  console.log(
    `  focus ${screen.name} ${theme}: ${stops} stops, ${missing.size} without a visible change`,
  );
}

/** With reduced motion, nothing should animate (spinners and loaders excepted) or stay hidden. */
async function checkReducedMotion(page: Page, screen: Screen) {
  await page.goto(`${origin}${screen.path}`, { waitUntil: "domcontentloaded" });
  await screen.ready(page);
  await scrollThrough(page);
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
        const name =
          (a as CSSAnimation).animationName ??
          (a as CSSTransition).transitionProperty ??
          "animation";
        return `${name} on ${target?.tagName.toLowerCase() ?? "?"}.${String(target?.className ?? "")
          .split(" ")
          .slice(0, 2)
          .join(".")}`;
      })
      .filter((label) => !/spin|pulse/.test(label)),
  );
  const hidden = await page.locator('[data-reveal="hidden"]').count();
  for (const label of running) {
    findings.push({
      page: screen.name,
      theme: "light",
      width: 1440,
      check: "reduced-motion",
      detail: `still animating: ${label}`,
    });
  }
  if (hidden) {
    findings.push({
      page: screen.name,
      theme: "light",
      width: 1440,
      check: "reduced-motion",
      detail: `${hidden} reveal(s) hidden`,
    });
  }
  console.log(`  reduced motion ${screen.name}: ${running.length} running, ${hidden} hidden`);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const visible = (selector: (page: Page) => ReturnType<Page["locator"]>) => (page: Page) =>
  selector(page).first().waitFor();

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await clerkSetup();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const run = crypto.randomUUID();
  const email = `kivo-audit-${run}+clerk_test@example.com`;
  const projectName = `Audit ${run.slice(0, 8)}`;
  let ownerId: string | undefined;
  let projectId: string | undefined;
  let site: Awaited<ReturnType<typeof serveHtml>> | undefined;
  const state = `${OUT}../.audit-state-${run}.json`;

  try {
    // Signed out: landing (dark only), sign-in, sign-up.
    const publicScreens: Screen[] = [
      {
        name: "01-landing",
        path: "/",
        signedIn: false,
        darkOnly: true,
        ready: visible((p) => p.locator("#hero-title")),
      },
      {
        name: "02-sign-in",
        path: "/sign-in",
        signedIn: false,
        ready: visible((p) => p.locator('input[name="identifier"]')),
      },
      {
        name: "03-sign-up",
        path: "/sign-up",
        signedIn: false,
        ready: visible((p) => p.locator('input[name="emailAddress"]')),
      },
    ];
    console.log("Signed-out screens");
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const ctx = await context(browser, { theme, width });
        const page = await ctx.newPage();
        for (const screen of publicScreens) {
          if (screen.darkOnly && theme === "dark") continue; // light scheme proves it stays dark
          await audit(page, screen, screen.darkOnly ? "-" : theme, width);
        }
        await ctx.close();
      }
    }

    // A fresh owner.
    console.log("Sign up a disposable owner");
    const ownerCtx = await context(browser, { theme: "light", width: 1440 });
    const owner = await ownerCtx.newPage();
    await owner.goto(origin);
    ownerId = await signUp(owner, origin, email);
    await ownerCtx.storageState({ path: state });

    const dashboard = (name: string, path: string, ready: Screen["ready"]): Screen => ({
      name,
      path,
      signedIn: true,
      ready,
    });
    const empty = dashboard(
      "04-projects-empty",
      "/dashboard",
      visible((p) => p.getByRole("textbox", { name: "New project" })),
    );
    await eachVariant(browser, state, [empty]);

    projectId = await createProject(owner, projectName);
    await uploadPdf(owner, origin);
    const snippet = await copySnippet(owner, origin);
    await ownerCtx.storageState({ path: state });

    const base = `/dashboard/projects/${projectId}`;
    const screens: Screen[] = [
      dashboard(
        "05-projects-one",
        "/dashboard",
        visible((p) => p.getByRole("link", { name: projectName, exact: true })),
      ),
      dashboard(
        "06-overview",
        base,
        visible((p) => p.getByRole("heading", { level: 1 })),
      ),
      dashboard(
        "07-knowledge",
        `${base}/knowledge`,
        visible((p) => p.locator("[data-status]")),
      ),
      dashboard(
        "08-install",
        `${base}/install`,
        visible((p) => p.getByTestId("install-snippet")),
      ),
    ];
    // Conversations before any question: the empty state.
    await eachVariant(browser, state, [
      dashboard(
        "09-conversations-empty",
        `${base}/conversations`,
        visible((p) => p.getByText("No conversations yet")),
      ),
    ]);
    // One widget question so Conversations has a thread (the run's only OpenAI call).
    site = await serveHtml("Audit page", snippet);
    const visitorCtx = await context(browser, { theme: "light", width: 1280 });
    const visitor = await visitorCtx.newPage();
    await openExternalPage(visitor, origin, site.origin);
    await askWidget(visitor, origin, "How long does it take to process refunds?");
    await visitorCtx.close();
    await owner.goto(`${origin}${base}/conversations`);
    const thread = owner.locator(`a[href^="${base}/conversations/"]`).first();
    await thread.waitFor();
    const threadPath = await thread.getAttribute("href");
    assert(threadPath, "Expected a conversation link.");
    const threadScreen = dashboard(
      "11-conversation-thread",
      threadPath,
      visible((p) => p.locator('[data-role="bot"]')),
    );
    screens.push(
      dashboard(
        "10-conversations",
        `${base}/conversations`,
        visible((p) => p.locator(`a[href^="${base}/conversations/"]`)),
      ),
      threadScreen,
      dashboard(
        "12-customize-free",
        `${base}/customize`,
        visible((p) => p.getByRole("heading", { level: 1 })),
      ),
      dashboard(
        "13-billing-free",
        "/dashboard/billing",
        visible((p) => p.getByRole("region", { name: "Subscription plans" })),
      ),
    );
    await eachVariant(browser, state, screens);
    for (const theme of THEMES) await checkBotAvatars(browser, state, threadScreen, theme);

    // Upgrade with Clerk's test card, then Customize and Billing as Pro at 375 and 1440.
    console.log("Checkout (test card)");
    await owner.goto(`${origin}/dashboard/billing`);
    assert(
      await checkout(owner),
      "Clerk Billing isn't in development mode; can't shoot the Pro screens.",
    );
    await waitForPro(owner);
    await ownerCtx.storageState({ path: state });
    const proScreens = [
      dashboard(
        "14-customize-pro",
        `${base}/customize`,
        visible((p) => p.getByRole("heading", { level: 1 })),
      ),
      dashboard(
        "15-billing-pro",
        "/dashboard/billing",
        visible((p) => p.getByRole("button", { name: "Manage subscription" })),
      ),
    ];
    await eachVariant(browser, state, proScreens, [375, 1440]);
    screens.push(...proScreens);
    await ownerCtx.close();

    // Widget panel on a light page (never themed: once per width), and the launcher on our dark landing.
    console.log("Widget");
    site ??= await serveHtml("Audit page", snippet);
    for (const width of WIDTHS) {
      const ctx = await context(browser, { theme: "light", width });
      const page = await ctx.newPage();
      await openExternalPage(page, origin, site.origin);
      await page.locator("chat-widget-host button").first().click();
      await page
        .frameLocator("chat-widget-host iframe")
        .getByRole("textbox", { name: "Message" })
        .waitFor();
      await page.waitForTimeout(600);
      const file = `${width}-light-16-widget-panel.png`;
      await page.screenshot({ path: `${OUT}${file}` });
      shots.push(file);
      const frame = page.frames().find((f) => f.url().includes("/embed"));
      if (frame) {
        const report = await frame.evaluate(inPageChecks);
        for (const c of report.contrast) {
          findings.push({
            page: "16-widget-panel",
            theme: "light",
            width,
            check: "contrast",
            detail: `${c.ratio}:1 < ${c.min}:1 — "${c.text}" ${c.fg} on ${c.bg}`,
          });
        }
        if (report.overflow.scrollWidth > report.overflow.viewport) {
          findings.push({
            page: "16-widget-panel",
            theme: "light",
            width,
            check: "overflow",
            detail: `${report.overflow.offenders.join("; ")}`,
          });
        }
      }
      await page.goto(origin);
      await page.locator("chat-widget-host button").first().waitFor();
      const launcher = `${width}-dark-17-launcher-on-landing.png`;
      await page.screenshot({ path: `${OUT}${launcher}` });
      shots.push(launcher);
      await ctx.close();
    }

    // Keyboard focus (1440, both themes) and reduced motion (1440 light).
    console.log("Focus and reduced motion");
    const all = [...publicScreens, ...screens];
    for (const theme of THEMES) {
      const ctx = await context(browser, { theme, width: 1440, storageState: state });
      const page = await ctx.newPage();
      for (const screen of all) {
        if (screen.darkOnly && theme === "dark") continue;
        if (!screen.signedIn && screen.path !== "/") continue; // sign-in/up redirect when signed in
        await checkFocus(page, screen, theme);
      }
      await ctx.close();
      const signedOut = await context(browser, { theme, width: 1440 });
      const out = await signedOut.newPage();
      for (const screen of publicScreens.filter((s) => s.path !== "/"))
        await checkFocus(out, screen, theme);
      await signedOut.close();
    }
    const reduced = await context(browser, {
      theme: "light",
      width: 1440,
      storageState: state,
      reducedMotion: "reduce",
    });
    const rp = await reduced.newPage();
    for (const screen of all.filter((s) => s.signedIn || s.path === "/"))
      await checkReducedMotion(rp, screen);
    await reduced.close();
  } finally {
    site?.close();
    await rm(state, { force: true });
    console.log("Cleanup");
    try {
      ownerId = (await deleteOwner(email, clerkSecret)) ?? ownerId;
      console.log(`  Clerk user ${ownerId ?? "(none)"} deleted`);
    } catch (error) {
      console.log(`  Clerk cleanup failed: ${String(error)}`);
    }
    if (ownerId) {
      const removed = await cleanSupabase(admin, ownerId, projectId ? [projectId] : []);
      console.log(
        `  Supabase verified clean (${removed.projects} project(s), ${removed.files} file(s) removed)`,
      );
    }
    await browser.close();
  }

  const report = {
    origin,
    at: new Date().toISOString(),
    terracotta: terracottaChecks(),
    shots,
    findings,
    notes,
  };
  await writeFile(`${OUT}report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${shots.length} screenshots, ${findings.length} findings → ${OUT}report.json`);
  const byCheck = new Map<string, number>();
  for (const f of findings) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
  for (const [check, count] of byCheck) console.log(`  ${check}: ${count}`);
}

/** Every bot message in a thread shows exactly one avatar mark (T08 renders one per theme). */
async function checkBotAvatars(browser: Browser, state: string, screen: Screen, theme: Theme) {
  const ctx = await context(browser, { theme, width: 1440, storageState: state });
  const page = await ctx.newPage();
  await page.goto(`${origin}${screen.path}`);
  await screen.ready(page);
  const counts = await page.locator('[data-role="bot"]').evaluateAll((items) =>
    items.map(
      (li) =>
        Array.from(li.querySelectorAll('[data-testid="bot-avatar"] svg')).filter((svg) => {
          const r = svg.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length,
    ),
  );
  for (const [i, count] of counts.entries()) {
    if (count !== 1) {
      findings.push({
        page: screen.name,
        theme,
        width: 1440,
        check: "bot-avatar",
        detail: `bot message ${i + 1} shows ${count} avatars`,
      });
    }
  }
  console.log(`  bot avatars ${theme}: ${JSON.stringify(counts)}`);
  await ctx.close();
}

/** Runs `screens` for every theme × width, signed in. */
async function eachVariant(
  browser: Browser,
  state: string,
  screens: Screen[],
  widths: readonly Width[] = WIDTHS,
) {
  for (const width of widths) {
    for (const theme of THEMES) {
      const ctx = await context(browser, { theme, width, storageState: state });
      const page = await ctx.newPage();
      for (const screen of screens) await audit(page, screen, theme, width);
      await ctx.close();
    }
  }
}

// Sanity: the color math the README quotes.
assert.equal(Math.round(contrastRatio(parseColor("#000000"), parseColor("#ffffff")) * 10) / 10, 21);

await main();
