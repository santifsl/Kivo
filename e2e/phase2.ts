// Phase 2 cross-origin check (docs/plan.md Phase 2 "Done when", project.md
// §6.5, §6.9): sign up → create a project → copy the Install snippet → a plain
// HTML page on another origin shows the button → the panel opens → a mock
// reply shows → close works; a bad key renders nothing. Deletes the project
// at the end.
//
//   pnpm e2e:phase2 <app-url>            e.g. https://kivo-git-….vercel.app
//                                        or   http://localhost:3000 (pnpm dev)
//
// Vercel previews are protected: set VERCEL_AUTOMATION_BYPASS_SECRET and the
// header is added to every request to the app, including the widget's
// cross-origin ones from the demo page. Not part of CI: it needs a live app.
//
// Output (screenshots + log) goes to e2e/output/<timestamp>/.

import { createServer, type Server } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";

const DEMO_PORT = 5500;
const DEMO_ORIGIN = `http://localhost:${DEMO_PORT}`;
const DEMO_FILE = fileURLToPath(new URL("../apps/widget/demo/index.html", import.meta.url));
const PLACEHOLDER = "<!-- WIDGET_SNIPPET -->";
const BAD_KEY = "pk_e2e_unknown_key_000";
const CLERK_TEST_CODE = "424242";
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Arguments and output
// ---------------------------------------------------------------------------

function parseAppOrigin(arg: string | undefined): string {
  if (!arg) {
    console.error("Usage: pnpm e2e:phase2 <app-url>");
    process.exit(2);
  }
  const url = new URL(arg);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Not an http(s) URL: ${arg}`);
  }
  return url.origin;
}

const appOrigin = parseAppOrigin(process.argv[2]);
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
if (appOrigin === DEMO_ORIGIN) throw new Error(`The app must not run on ${DEMO_ORIGIN}`);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = fileURLToPath(new URL(`./output/${runId}/`, import.meta.url));
const logLines: string[] = [];

function log(line: string): void {
  console.log(line);
  logLines.push(line);
}

let shotCount = 0;
async function screenshot(page: Page, name: string): Promise<void> {
  shotCount += 1;
  const file = `${String(shotCount).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: `${outDir}${file}` });
  log(`    screenshot: ${file}`);
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    log(`✓ ${name} (${Date.now() - started} ms)`);
    return result;
  } catch (error) {
    log(`✗ ${name} (${Date.now() - started} ms)`);
    log(`    ${(error as Error).message.split("\n").join("\n    ")}`);
    throw error;
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// The demo site: a plain static server on another origin
// ---------------------------------------------------------------------------

function startDemoServer(pages: Record<string, string>): Promise<Server> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", DEMO_ORIGIN).pathname;
    const body = pages[path];
    if (body === undefined) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(DEMO_PORT, "127.0.0.1", () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Adds the Vercel bypass header to every request for the app's origin. */
async function addBypass(context: BrowserContext): Promise<void> {
  if (!bypassSecret) return;
  await context.route(
    (url) => url.origin === appOrigin,
    (route) =>
      route.continue({
        headers: { ...route.request().headers(), "x-vercel-protection-bypass": bypassSecret },
      }),
  );
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto(`${appOrigin}/sign-up`);
  await page.locator('input[name="emailAddress"]').fill(email);
  const password = page.locator('input[name="password"]');
  if (await password.isVisible()) await password.fill(`E2e-${crypto.randomUUID()}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Clerk's one-time code: one input that spreads the digits across boxes.
  const code = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await code.waitFor({ timeout: TIMEOUT_MS });
  await screenshot(page, "sign-up-code");
  await code.pressSequentially(CLERK_TEST_CODE);
  await page.waitForURL(`${appOrigin}/dashboard**`, { timeout: TIMEOUT_MS });
}

async function createProject(page: Page, name: string): Promise<void> {
  if (!page.url().startsWith(`${appOrigin}/dashboard`)) await page.goto(`${appOrigin}/dashboard`);
  await page.getByLabel("New project").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name, exact: true }).waitFor({ timeout: TIMEOUT_MS });
}

async function copySnippet(page: Page, name: string): Promise<string> {
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("link", { name: "Install", exact: true }).click();
  await page.waitForURL(/\/install$/, { timeout: TIMEOUT_MS });
  const shown = (await page.getByTestId("install-snippet").textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "Copy install code" }).click();
  await page.getByText("Copied", { exact: true }).waitFor({ timeout: TIMEOUT_MS });
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).trim();
  check(copied === shown, `Clipboard doesn't match the shown snippet:\n${copied}\nvs\n${shown}`);
  const src = /src="([^"]+)"/.exec(copied)?.[1];
  check(
    src !== undefined && new URL(src).origin === appOrigin,
    `Snippet's script src ${src} isn't on ${appOrigin}`,
  );
  check(/data-key="pk_[A-Za-z0-9_-]{8,64}"/.test(copied), `Snippet has no valid data-key: ${copied}`);
  return copied;
}

/** Console errors and uncaught exceptions on a page, for the widget checks. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()} (${msg.location().url})`);
  });
  page.on("pageerror", (err) => errors.push(`exception: ${err.message}`));
  return errors;
}

async function checkWidget(page: Page): Promise<void> {
  const errors = watchErrors(page);
  const button = page.locator("chat-widget-host button");
  const panel = page.locator("chat-widget-host iframe");

  await step("demo page on another origin shows the button", async () => {
    await page.goto(`${DEMO_ORIGIN}/index.html`);
    await button.waitFor({ state: "visible", timeout: TIMEOUT_MS });
    // The page's CSS hides every <button> and rotates/fades it; none of that may reach ours.
    const style = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, opacity: s.opacity, transform: s.transform };
    });
    check(
      style.display !== "none" && style.opacity === "1" && style.transform === "none",
      `Host CSS leaked into the button: ${JSON.stringify(style)}`,
    );
    const box = await page.locator("chat-widget-host").boundingBox();
    const viewport = page.viewportSize();
    check(
      box !== null && viewport !== null && box.x + box.width > viewport.width / 2,
      "Button isn't in the right-hand corner",
    );
    await screenshot(page, "demo-button");
  });

  await step("click → panel opens", async () => {
    await button.click();
    await panel.waitFor({ state: "visible", timeout: TIMEOUT_MS });
    check((await button.getAttribute("aria-expanded")) === "true", "aria-expanded isn't true");
    const frame = page.frameLocator("chat-widget-host iframe");
    await frame.getByLabel("Message").waitFor({ timeout: TIMEOUT_MS });
    await screenshot(page, "panel-open");
  });

  await step('send "Hello" → mock reply shows', async () => {
    const frame = page.frameLocator("chat-widget-host iframe");
    await frame.getByLabel("Message").fill("Hello");
    await frame.getByRole("button", { name: "Send" }).click();
    await frame.locator('[data-role="visitor"]', { hasText: "Hello" }).waitFor();
    const reply = frame.locator('[data-role="bot"]').last();
    await reply.waitFor({ timeout: TIMEOUT_MS });
    const text = (await reply.textContent())?.trim() ?? "";
    check(text.length > 0, "Bot reply is empty");
    log(`    reply: "${text}"`);
    await screenshot(page, "mock-reply");
  });

  await step("close works", async () => {
    await page.frameLocator("chat-widget-host iframe").getByLabel("Close chat").click();
    await panel.waitFor({ state: "hidden", timeout: TIMEOUT_MS });
    check((await button.getAttribute("aria-expanded")) === "false", "aria-expanded isn't false");
    await button.waitFor({ state: "visible" });
    await screenshot(page, "panel-closed");
  });

  await step("no console errors or exceptions on the demo page", async () => {
    check(errors.length === 0, errors.join("\n"));
  });
}

async function checkBadKey(page: Page): Promise<void> {
  const errors = watchErrors(page);
  await step("bad key → nothing renders, no errors from the widget", async () => {
    const config = page.waitForResponse((r) => r.url().startsWith(`${appOrigin}/api/widget/config`));
    await page.goto(`${DEMO_ORIGIN}/bad-key.html`);
    const response = await config;
    log(`    config request: ${response.status()} ${response.url()}`);
    await page.waitForTimeout(1500); // give a (wrong) render time to happen
    check((await page.locator("chat-widget-host").count()) === 0, "The widget rendered");
    // Chrome logs every non-2xx fetch as "Failed to load resource" for the URL
    // itself. That's the browser reporting the 404, not the widget; anything
    // else counts.
    const fromWidget = errors.filter(
      (e) => !(e.includes("Failed to load resource") && e.includes("/api/widget/config")),
    );
    for (const e of errors) log(`    ${fromWidget.includes(e) ? "WIDGET" : "browser"} ${e}`);
    check(fromWidget.length === 0, fromWidget.join("\n"));
    await screenshot(page, "bad-key");
  });
}

async function deleteProject(page: Page, name: string): Promise<void> {
  await page.goto(`${appOrigin}/dashboard`);
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).waitFor({ state: "detached", timeout: TIMEOUT_MS });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  await mkdir(outDir, { recursive: true });
  log(`Phase 2 check against ${appOrigin}, demo site ${DEMO_ORIGIN}`);
  log(`Vercel bypass header: ${bypassSecret ? "on" : "off (VERCEL_AUTOMATION_BYPASS_SECRET not set)"}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appOrigin });
  await addBypass(context);

  const app = await context.newPage();
  const email = `kivo-e2e-${Date.now()}+clerk_test@example.com`;
  const projectName = `E2E ${runId.slice(0, 19)}`;
  let created = false;
  let server: Server | null = null;
  let failed = false;

  try {
    await step(`sign up as ${email}`, () => signUp(app, email));
    await step(`create project "${projectName}"`, async () => {
      await createProject(app, projectName);
      created = true;
      await screenshot(app, "project-created");
    });
    const snippet = await step("open Install and copy the snippet", async () => {
      const s = await copySnippet(app, projectName);
      log(`    snippet: ${s}`);
      await screenshot(app, "install");
      return s;
    });

    const demo = await readFile(DEMO_FILE, "utf8");
    check(demo.includes(PLACEHOLDER), `${DEMO_FILE} has no ${PLACEHOLDER}`);
    const badSnippet = snippet.replace(/data-key="[^"]*"/, `data-key="${BAD_KEY}"`);
    server = await startDemoServer({
      "/index.html": demo.replace(PLACEHOLDER, snippet),
      "/bad-key.html": demo.replace(PLACEHOLDER, badSnippet),
    });

    await checkWidget(await context.newPage());
    await checkBadKey(await context.newPage());
  } catch {
    failed = true;
  } finally {
    if (created) {
      try {
        await step(`delete project "${projectName}"`, () => deleteProject(app, projectName));
      } catch {
        failed = true;
      }
    }
    server?.close();
    await browser.close();
    log(failed ? "FAILED" : "PASSED");
    await writeFile(`${outDir}output.txt`, `${logLines.join("\n")}\n`);
    console.log(`Output: ${outDir}`);
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();
