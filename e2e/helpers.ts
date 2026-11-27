// Shared Playwright helpers for the e2e scripts (phase3, phase4, phase5, core-flow).
// Every helper takes the app origin explicitly, so importing this module runs nothing.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "playwright";
import type { ListProjectsResponse } from "../packages/shared/src/api/projects.ts";
import type { ChatResponse } from "../packages/shared/src/api/widget.ts";
import type { ApiError } from "../packages/shared/src/errors.ts";
import type { WidgetConfig } from "../packages/shared/src/widget.ts";

export const PDF = fileURLToPath(
  new URL("../apps/web/test/fixtures/knowledge/sample.pdf", import.meta.url),
);
/** A fact that is only in the fixture PDF. */
export const PDF_QUESTION = "How long does it take to process refunds?";
export const PDF_ANSWER = /\b(?:5|five) business days\b/i;
export const FALLBACK =
  "I don't know the answer to that. Please reach out to the team directly for help.";
export const CHAT_PATH = "/api/widget/chat";

export const FREE_CONFIG: WidgetConfig = {
  button_color: "#000000",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
  header_text: "How can we help?",
  show_badge: true,
};

export const CUSTOM_CONFIG = {
  button_color: "#2468ac",
  position: "top-left",
  label: "Ask support",
  animation: "scale",
  header_text: "Customer support",
  show_badge: false,
} satisfies WidgetConfig;

const PREVIEW_HOST = /^kivo-[a-z0-9-]+-santifsl\.vercel\.app$/;

/** True for a Kivo Vercel Preview, which needs the protection bypass header. */
export function isPreview(origin: string): boolean {
  const url = new URL(origin);
  return url.protocol === "https:" && PREVIEW_HOST.test(url.hostname);
}

/** The origin of an https app URL (or a local dev server), without credentials. */
export function appOrigin(value: string | undefined, usage: string): string {
  assert(value, usage);
  const url = new URL(value);
  assert(
    url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)),
    "Use an https app URL (or a local dev server).",
  );
  assert(!url.username && !url.password, "Use a URL without credentials.");
  return url.origin;
}

/** The origin of a Kivo Preview URL from GitHub, or exits with `usage`. */
export function previewOrigin(value: string | undefined, usage: string): string {
  assert(value, usage);
  const url = new URL(value);
  assert(isPreview(url.origin), "Use the Kivo preview URL from GitHub.");
  assert(!url.username && !url.password, "Use a URL without credentials.");
  return url.origin;
}

/** Sends the Vercel bypass header on every request to the Preview from this context. */
export async function allowPreview(context: BrowserContext, origin: string, secret: string) {
  let first = true;
  await context.route(
    (url) => url.origin === origin,
    async (route) => {
      const headers = {
        ...route.request().headers(),
        "x-vercel-protection-bypass": secret,
        ...(first && { "x-vercel-set-bypass-cookie": "true" }),
      };
      first = false;
      await route.continue({ headers });
    },
  );
}

/** Signs up from the landing page's "Start free" link. Returns the Clerk user ID. */
export async function signUp(page: Page, origin: string, email: string): Promise<string> {
  await page.getByRole("link", { name: "Start free", exact: true }).first().click();
  await page.locator('input[name="emailAddress"]').fill(email);
  const password = page.locator('input[name="password"]');
  if (await password.isVisible()) await password.fill(`E2e-${crypto.randomUUID()}`);
  const [prepared] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/prepare_verification")),
    page.getByRole("button", { name: "Continue", exact: true }).click(),
  ]);
  assert(prepared.ok(), `Clerk verification setup returned HTTP ${prepared.status()}`);
  // Clerk's fixed code for +clerk_test addresses (test mode only).
  await page
    .locator('input[name="code"], input[autocomplete="one-time-code"]')
    .first()
    .pressSequentially("424242");
  await page.waitForURL(`${origin}/dashboard**`);
  const currentUser = () =>
    (window as Window & { Clerk?: { user?: { id: string } } }).Clerk?.user?.id;
  await page.waitForFunction(currentUser);
  const id = await page.evaluate(currentUser);
  assert(id && /^user_[A-Za-z0-9]+$/.test(id), "Expected a disposable Clerk owner ID.");
  return id;
}

/** Creates a project from the dashboard and opens it (its Overview). Returns the project ID. */
export async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole("textbox", { name: "New project" }).fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = /\/projects\/([0-9a-f-]{36})$/.exec(new URL(page.url()).pathname)?.[1];
  assert(projectId, "Expected the new project's Overview page.");
  return projectId;
}

/** Uploads the fixture PDF in Knowledge and waits until it is Ready. */
export async function uploadPdf(page: Page, origin: string) {
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  const [finalized] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === origin &&
        url.pathname.endsWith("/knowledge/finalize") &&
        response.request().method() === "POST"
      );
    }),
    page.getByLabel(/Choose a file/).setInputFiles(PDF),
  ]);
  assert.equal(finalized.status(), 200, "Expected HTTP 200 for PDF finalization.");
  const status = page.getByRole("listitem").filter({ hasText: "sample" }).locator("[data-status]");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await status.getAttribute("data-status");
    if (state === "ready") return;
    assert.notEqual(state, "failed", "PDF processing failed.");
    await delay(2_000);
    const refresh = await page.reload({ waitUntil: "domcontentloaded" });
    assert(refresh?.ok(), `Knowledge refresh returned HTTP ${refresh?.status()}`);
  }
  throw new Error("PDF did not become Ready within 90 seconds.");
}

/** Copies the Install snippet with the Copy button and returns the clipboard text. */
export async function copySnippet(page: Page, origin: string): Promise<string> {
  await page.getByRole("link", { name: "Install", exact: true }).click();
  await page.waitForURL(/\/install$/);
  const snippet = page.getByTestId("install-snippet");
  const expected = await snippet.textContent();
  const [, source] =
    /^<script src="([^"]+)" data-key="pk_[A-Za-z0-9_-]+" async><\/script>$/.exec(expected ?? "") ??
    [];
  assert.equal(source, `${origin}/widget.js`, "Expected the install script from this app.");
  assert(await snippet.evaluate((element) => element.classList.contains("ph-no-capture")));
  const copy = page.getByRole("button", { name: "Copy install code" });
  const copied = copy.getByText("Copied", { exact: true });
  // A click that lands before the page hydrates does nothing, so retry it.
  for (let attempt = 1; ; attempt += 1) {
    await copy.click();
    try {
      await copied.waitFor({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clipboard, expected, "Expected the clipboard to contain the install snippet.");
  return clipboard;
}

/** Serves one plain HTML page with `snippet` on a fresh 127.0.0.1 port (another origin). */
export async function serveHtml(title: string, snippet: string) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><title>${title}</title>${snippet}`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

/**
 * Opens the external page. On a Preview, it first loads widget.js directly so the
 * bypass cookie exists before the separate origin requests the protected script.
 */
export async function openExternalPage(page: Page, appOrigin: string, pageOrigin: string) {
  const widgetScript = `${appOrigin}/widget.js`;
  if (isPreview(appOrigin)) {
    assert.equal((await page.goto(widgetScript))?.status(), 200, "Expected the widget script.");
  }
  const [loader, document] = await Promise.all([
    page.waitForResponse((item) => item.url() === widgetScript),
    page.goto(pageOrigin),
  ]);
  assert.equal(document?.status(), 200, "Expected the external page.");
  assert.equal(loader.status(), 200, "The external page could not load the widget script.");
}

/** Asks a question in the page's widget (opening it if needed) and waits for the shown reply. */
export async function askWidget(
  page: Page,
  appOrigin: string,
  question: string,
): Promise<ChatResponse> {
  const widget = page.frameLocator("chat-widget-host iframe");
  const message = widget.getByRole("textbox", { name: "Message" });
  if (!(await message.isVisible())) await page.locator("chat-widget-host button").first().click();
  await message.fill(question);
  const [response] = await Promise.all([
    page.waitForResponse(
      (item) => item.url() === `${appOrigin}${CHAT_PATH}` && item.request().method() === "POST",
    ),
    widget.getByRole("button", { name: "Send", exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, `Widget chat returned HTTP ${response.status()}.`);
  const chat = (await response.json()) as ChatResponse;
  await widget.locator('[data-role="bot"]').filter({ hasText: chat.reply }).waitFor();
  return chat;
}

/** Conversations lists `chat` (2 messages, usage 1) and its thread shows both messages. */
export async function verifyConversation(
  page: Page,
  projectId: string,
  question: string,
  chat: ChatResponse,
) {
  const usage = page.getByText("Messages used this month:", { exact: false });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const row = page.getByRole("link").filter({ hasText: question });
  await row.waitFor();
  await row.getByText("2 messages", { exact: true }).waitFor();
  await usage.getByText(/^1\s*\//).waitFor();
  assert.equal(
    await row.getAttribute("href"),
    `/dashboard/projects/${projectId}/conversations/${chat.conversationId}`,
  );
  await row.click();

  const thread = page.getByRole("region", { name: "Conversation", exact: true });
  await thread.getByText(question, { exact: true }).waitFor();
  await thread.getByText(chat.reply, { exact: true }).waitFor();
  assert.equal(
    await thread.locator(".ph-no-capture").count(),
    2,
    "Both chat messages are blocked from replay.",
  );
}

export async function readPlan(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not read the owner plan (HTTP ${response.status}).`);
    return ((await response.json()) as ListProjectsResponse).plan;
  });
}

export async function waitForPro(page: Page) {
  const deadline = Date.now() + 90_000;
  do {
    if ((await readPlan(page)) === "pro") return;
    await delay(2_000);
  } while (Date.now() < deadline);
  throw new Error(
    "Checkout did not update the server plan. Check Clerk's signed delivery and the webhook logs.",
  );
}

/** A Free owner's config save is refused on the server with HTTP 402. */
export async function attemptFreeSave(page: Page, projectId: string) {
  const result = await page.evaluate(
    async ({ id, config }) => {
      const response = await fetch(`/api/projects/${id}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      return { status: response.status, body: (await response.json()) as ApiError };
    },
    { id: projectId, config: CUSTOM_CONFIG },
  );
  assert.equal(result.status, 402, "Expected the Free save to return HTTP 402.");
  assert.equal(result.body?.error?.code, "payment_required");
}

/** Fills Customize with CUSTOM_CONFIG and saves it. */
export async function saveConfig(page: Page, origin: string, projectId: string) {
  await page.getByLabel("Button color", { exact: true }).fill(CUSTOM_CONFIG.button_color);
  await page.getByLabel("Button position", { exact: true }).selectOption(CUSTOM_CONFIG.position);
  await page.getByLabel("Button label", { exact: true }).fill(CUSTOM_CONFIG.label);
  await page.getByLabel("Open animation", { exact: true }).selectOption(CUSTOM_CONFIG.animation);
  await page.getByLabel("Header text", { exact: true }).fill(CUSTOM_CONFIG.header_text);
  await page.getByLabel("Show “Powered by” badge", { exact: true }).uncheck();
  const [response] = await Promise.all([
    page.waitForResponse(
      (item) =>
        item.url() === `${origin}/api/projects/${projectId}/config` &&
        item.request().method() === "PATCH",
    ),
    page.getByRole("button", { name: "Save changes", exact: true }).click(),
  ]);
  assert.deepEqual(response.request().postDataJSON(), CUSTOM_CONFIG);
  assert.equal(response.status(), 200, "Expected the saved widget config.");
  assert.deepEqual(await response.json(), { config: CUSTOM_CONFIG });
  await page.getByText("Changes saved.", { exact: true }).waitFor();
}

/**
 * Pays for Pro in Clerk's checkout drawer with Stripe's test Visa.
 * Returns false (and pays nothing) when Clerk Billing is not in development mode.
 */
export async function checkout(page: Page): Promise<boolean> {
  const plans = page.getByRole("region", { name: "Subscription plans", exact: true });
  await plans.getByRole("heading", { name: /^pro$/i }).waitFor();
  await plans.getByRole("button", { name: "Subscribe", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: "Checkout", exact: true }).waitFor();
  const payment = drawer.frameLocator("iframe");
  const card = payment.getByRole("tabpanel", { name: "Card", exact: true });
  const cardNumber = card.getByRole("textbox", { name: "Card number" });
  // The payment form loads slowly; Clerk shows "Development mode" by the time it is ready.
  await cardNumber.waitFor({ timeout: 60_000 });
  if (!(await drawer.getByText("Development mode", { exact: true }).isVisible())) return false;
  // Clerk's testing guide links to Stripe's interactive test Visa.
  await cardNumber.fill("4242424242424242");
  const year = String(new Date().getFullYear() + 2).slice(-2);
  await card.getByRole("textbox", { name: "Expiration date" }).fill(`12${year}`);
  await card.getByRole("textbox", { name: "Security code" }).fill("123");
  await card.getByRole("combobox", { name: "Country" }).selectOption("US");
  await card.getByRole("textbox", { name: /zip|postal code/i }).fill("10001");
  const [confirmation] = await Promise.all([
    page.waitForResponse(
      (response) =>
        /^\/v1\/me\/billing\/checkouts\/[^/]+\/confirm$/.test(new URL(response.url()).pathname) &&
        response.request().method() === "POST",
    ),
    drawer.getByRole("button", { name: /^Pay \$/ }).click(),
  ]);
  assert(confirmation.ok(), `Clerk checkout confirmation returned HTTP ${confirmation.status()}.`);
  return true;
}

export async function verifySubscriptionManagement(page: Page) {
  const checkoutDrawer = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Checkout", exact: true }),
  });
  if (await checkoutDrawer.isVisible()) {
    await checkoutDrawer.getByRole("button", { name: "Close drawer", exact: true }).click();
  }
  await page.getByRole("button", { name: "Manage subscription", exact: true }).click();
  const drawer = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Subscription", exact: true }),
  });
  await drawer.getByText(/^pro$/i).waitFor();
  await drawer.getByText(/\bActive\b/).waitFor();
}

/** The installed widget matches `expected`: label, color, position, animation, header, badge. */
export async function checkInstallation(page: Page, expected: WidgetConfig) {
  const host = page.locator("chat-widget-host");
  const button = host.getByRole("button", { name: expected.label, exact: true });
  await button.waitFor();
  assert.equal((await button.textContent())?.trim(), expected.label);
  const color = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
  const rgb = expected.button_color
    .slice(1)
    .match(/../g)
    ?.map((channel) => Number.parseInt(channel, 16))
    .join(", ");
  assert.equal(color, `rgb(${rgb})`);

  const edges = await host.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      top: box.top,
      left: box.left,
      bottom: innerHeight - box.bottom,
      right: innerWidth - box.right,
    };
  });
  const [vertical, horizontal] = expected.position.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  assert(
    edges[vertical] >= 0 && edges[vertical] < 40,
    `Expected launcher at the ${vertical} edge.`,
  );
  assert(
    edges[horizontal] >= 0 && edges[horizontal] < 40,
    `Expected launcher at the ${horizontal} edge.`,
  );
  // Sample Chromium's generated CSS transitions immediately after opening.
  // Reading the running transitions proves the first open actually animates.
  const motion = await button.evaluate((element) => {
    (element as HTMLButtonElement).click();
    const frame = (element.getRootNode() as ShadowRoot).querySelector("iframe");
    if (!frame) throw new Error("Opening the launcher did not create the iframe.");
    const animations = frame
      .getAnimations()
      .filter((animation) => animation instanceof CSSTransition);
    const opacity = animations.find((animation) => animation.transitionProperty === "opacity");
    const transform = animations.find((animation) => animation.transitionProperty === "transform");
    const start = (transform?.effect as KeyframeEffect | undefined)?.getKeyframes()[0]?.transform;
    return {
      opacity: (opacity?.effect as KeyframeEffect | undefined)
        ?.getKeyframes()
        .map((frame) => frame.opacity),
      scale: typeof start === "string" ? new DOMMatrix(start).a : 1,
      slides: typeof start === "string" && new DOMMatrix(start).f !== 0,
    };
  });
  assert.deepEqual(motion.opacity, ["0", "1"], "Expected the panel to fade in.");
  const expectedScale = expected.animation === "scale" ? 0.9 : 1;
  assert(Math.abs(motion.scale - expectedScale) < 0.001, "Unexpected starting scale.");
  assert.equal(motion.slides, expected.animation === "slide");

  const panel = host.frameLocator("iframe");
  await panel.getByRole("heading", { name: expected.header_text, exact: true }).waitFor();
  await panel.getByRole("textbox", { name: "Message" }).waitFor();
  const badge = panel.getByRole("link", { name: /^Powered by / });
  if (expected.show_badge) await badge.waitFor();
  else assert.equal(await badge.count(), 0, "Expected the Pro badge to be hidden.");
}

/** Deletes a project through the dashboard's Delete dialog, if it still exists. */
export async function deleteProjectInDashboard(page: Page, origin: string, name: string) {
  await page.goto(`${origin}/dashboard`);
  await page.getByRole("textbox", { name: "New project" }).waitFor();
  const button = page.getByRole("button", { name: `Delete ${name}`, exact: true });
  if (!(await button.count())) return;
  await button.click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).waitFor({ state: "detached" });
}

/** Deletes the one Clerk user with `email`, if any. Returns its ID. */
export async function deleteOwner(email: string, secret: string) {
  const endpoint = new URL("https://api.clerk.com/v1/users");
  endpoint.searchParams.set("email_address", email);
  const options = {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(15_000),
  };
  const response = await fetch(endpoint, options);
  assert(response.ok, `Clerk fixture lookup returned HTTP ${response.status}`);
  const owners = (await response.json()) as {
    id: string;
    email_addresses: { email_address: string }[];
  }[];
  if (owners.length === 0) return;
  const [owner] = owners;
  assert(
    owners.length === 1 &&
      owner &&
      /^user_[A-Za-z0-9]+$/.test(owner.id) &&
      owner.email_addresses.some((entry) => entry.email_address === email),
    "Expected one disposable Clerk fixture.",
  );
  const deleted = await fetch(
    `${endpoint.origin}${endpoint.pathname}/${encodeURIComponent(owner.id)}`,
    { ...options, method: "DELETE" },
  );
  assert(deleted.ok, `Clerk fixture deletion returned HTTP ${deleted.status}`);
  return owner.id;
}
