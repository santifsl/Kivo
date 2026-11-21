// pnpm e2e:phase4 <dev-preview-url> [--require-posthog]
// Requires Chromium, Clerk dev keys and VERCEL_AUTOMATION_BYPASS_SECRET for protected previews.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { ChatResponse } from "../packages/shared/src/api/widget.ts";

const PDF = fileURLToPath(
  new URL("../apps/web/test/fixtures/knowledge/sample.pdf", import.meta.url),
);
const QUESTION = "How long does it take to process refunds?";
const CHAT_PATH = "/api/widget/chat";

function getPreviewOrigin(value: string | undefined): string {
  assert(value, "Usage: pnpm e2e:phase4 <dev-preview-url> [--require-posthog]");
  const url = new URL(value);
  assert(
    url.protocol === "https:" && /^kivo-[a-z0-9-]+-santifsl\.vercel\.app$/.test(url.hostname),
    "Use the Kivo preview URL from GitHub.",
  );
  assert(!url.username && !url.password, "Use a URL without credentials.");
  return url.origin;
}

const origin = getPreviewOrigin(process.argv[2]);
const requirePosthog = process.argv[3] === "--require-posthog";
const clerkKey = process.env.CLERK_SECRET_KEY;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
assert(
  clerkKey && clerkKey.startsWith("sk_test_"),
  "CLERK_SECRET_KEY must be a Clerk development key.",
);
assert(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"),
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk development key.",
);
assert(bypass, "VERCEL_AUTOMATION_BYPASS_SECRET is required for the Kivo preview.");

async function allowPreview(context: BrowserContext, secret: string) {
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

async function readPosthogHost(
  context: BrowserContext,
  secret: string,
): Promise<string | undefined> {
  const response = await context.request.get(`${origin}/api/posthog-config`, {
    headers: { "x-vercel-protection-bypass": secret },
  });
  if (response.status() === 204) return;
  assert.equal(response.status(), 200, "Expected the preview PostHog config endpoint to respond.");
  const { key, host } = (await response.json()) as { key?: string; host?: string };
  assert(key?.startsWith("phc_") && host, "Preview must return a PostHog project token and host.");
  return new URL(host).origin;
}

async function signUp(page: Page, email: string): Promise<string> {
  await page.getByRole("link", { name: "Start free", exact: true }).first().click();
  await page.locator('input[name="emailAddress"]').fill(email);
  const password = page.locator('input[name="password"]');
  if (await password.isVisible()) await password.fill(`E2e-${crypto.randomUUID()}`);
  const [prepared] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/prepare_verification")),
    page.getByRole("button", { name: "Continue", exact: true }).click(),
  ]);
  assert(prepared.ok(), `Clerk verification setup returned HTTP ${prepared.status()}`);
  await page
    .locator('input[name="code"], input[autocomplete="one-time-code"]')
    .first()
    .pressSequentially("424242");
  await page.waitForURL(`${origin}/dashboard**`);
  const owner = () => (window as Window & { Clerk?: { user?: { id: string } } }).Clerk?.user?.id;
  await page.waitForFunction(owner);
  const id = await page.evaluate(owner);
  assert(id && id.startsWith("user_"), "Expected a Clerk owner ID.");
  return id;
}

async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole("textbox", { name: "New project" }).fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForURL(/\/install$/);
  const projectId = /\/projects\/([0-9a-f-]{36})\/install$/.exec(new URL(page.url()).pathname)?.[1];
  assert(projectId, "Expected the new project's install page.");
  return projectId;
}

async function uploadPdf(page: Page) {
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
  assert.equal(finalized.status(), 200, "Expected PDF finalization to succeed.");
  const status = page.getByRole("listitem").filter({ hasText: "sample" }).locator("[data-status]");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await status.getAttribute("data-status");
    if (state === "ready") return;
    assert.notEqual(state, "failed", "PDF processing failed.");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    assert(
      (await page.reload({ waitUntil: "domcontentloaded" }))?.ok(),
      "Knowledge refresh failed.",
    );
  }
  throw new Error("PDF processing did not reach Ready.");
}

async function copySnippet(page: Page): Promise<string> {
  await page.getByRole("link", { name: "Install", exact: true }).click();
  const snippet = page.getByTestId("install-snippet");
  const expected = await snippet.textContent();
  const [, source] =
    /^<script src="([^"]+)" data-key="pk_[A-Za-z0-9_-]+" async><\/script>$/.exec(expected ?? "") ??
    [];
  assert.equal(source, `${origin}/widget.js`, "Expected the install script from this preview.");
  assert(await snippet.evaluate((element) => element.classList.contains("ph-no-capture")));
  const copy = page.getByRole("button", { name: "Copy install code" });
  await copy.click();
  await copy.getByText("Copied", { exact: true }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert(copied === expected, "Expected the copied snippet to match the install page.");
  return copied;
}

async function sendVisitorChat(page: Page, demoOrigin: string): Promise<ChatResponse> {
  const widgetScript = `${origin}/widget.js`;
  // Establish preview access before the protected script is requested cross-site.
  assert.equal(
    (await page.goto(widgetScript))?.status(),
    200,
    "Expected the preview widget script.",
  );
  const [loader] = await Promise.all([
    page.waitForResponse((item) => item.url() === widgetScript),
    page.goto(demoOrigin),
  ]);
  assert.equal(loader.status(), 200, "The external page could not load the preview widget script.");
  await page.locator("chat-widget-host button").click();
  const widget = page.frameLocator("chat-widget-host iframe");
  await widget.getByRole("textbox", { name: "Message" }).fill(QUESTION);
  const [response] = await Promise.all([
    page.waitForResponse(
      (item) => item.url() === `${origin}${CHAT_PATH}` && item.request().method() === "POST",
    ),
    widget.getByRole("button", { name: "Send", exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, "Expected a successful widget chat.");
  const chat = (await response.json()) as ChatResponse;
  assert.match(chat.reply, /\b(?:5|five) business days\b/i, "Expected a PDF-grounded reply.");
  await widget.locator('[data-role="bot"]').filter({ hasText: chat.reply }).waitFor();
  return chat;
}

async function verifyConversation(page: Page, projectId: string, chat: ChatResponse) {
  const usage = page.getByText("Messages used this month:", { exact: false });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  const row = page.getByRole("link").filter({ hasText: QUESTION });
  await row.waitFor();
  await row.getByText("2 messages", { exact: true }).waitFor();
  await usage.getByText(/^1\s*\//).waitFor();
  assert.equal(
    await row.getAttribute("href"),
    `/dashboard/projects/${projectId}/conversations/${chat.conversationId}`,
  );
  await row.click();

  const thread = page.getByRole("region", { name: "Conversation", exact: true });
  await thread.getByText(QUESTION, { exact: true }).waitFor();
  await thread.getByText(chat.reply, { exact: true }).waitFor();
  assert.equal(
    await thread.locator(".ph-no-capture").count(),
    2,
    "Both chat messages are blocked from replay.",
  );
}

async function deleteProject(page: Page, name: string) {
  await page.goto(`${origin}/dashboard`);
  await page.getByRole("textbox", { name: "New project" }).waitFor();
  const button = page.getByRole("button", { name: `Delete ${name}`, exact: true });
  if (!(await button.count())) return;
  await button.click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).waitFor({ state: "detached" });
}

async function deleteOwner(email: string, secret: string) {
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
      owner.email_addresses.some(({ email_address }) => email_address === email),
    "Expected one disposable Clerk fixture.",
  );
  const deleted = await fetch(
    `${endpoint.origin}${endpoint.pathname}/${encodeURIComponent(owner.id)}`,
    {
      ...options,
      method: "DELETE",
    },
  );
  assert(deleted.ok, `Clerk fixture deletion returned HTTP ${deleted.status}`);
}

async function main(secret: string, protectionBypass: string) {
  const run = crypto.randomUUID();
  const email = `kivo-phase4-${run}+clerk_test@example.com`;
  const name = `Phase 4 fixture ${run}`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const demo = createServer();
  let ownerPage: Page | undefined;
  let signUpAttempted = false;
  let projectAttempted = false;
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await allowPreview(context, protectionBypass);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    const posthogHost = await readPosthogHost(context, protectionBypass);
    if (requirePosthog) {
      assert(
        posthogHost,
        "Preview PostHog configuration is missing. Configure its project key and host first.",
      );
    }
    if (posthogHost) {
      // PostHog excludes automated browsers. Opt this disposable fixture into collection on Kivo only.
      await context.addInitScript((appOrigin) => {
        if (location.origin !== appOrigin) return;
        const userAgent = navigator.userAgent.replace("HeadlessChrome", "Chrome");
        Object.defineProperty(navigator, "userAgent", { get: () => userAgent });
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      }, origin);
    }

    const page = await context.newPage();
    ownerPage = page;
    await clerkSetup();
    await setupClerkTestingToken({ page: ownerPage });
    if (requirePosthog && posthogHost) {
      const [accepted, landing] = await Promise.all([
        ownerPage.waitForResponse((response) => {
          const { origin: target, pathname } = new URL(response.url());
          return (
            target === posthogHost &&
            /\/(?:i\/v0\/)?e\/?$/.test(pathname) &&
            response.request().method() === "POST"
          );
        }),
        page.goto(origin),
      ]);
      assert(accepted.ok(), "PostHog did not accept the browser's landing event.");
      assert.equal(landing?.status(), 200, "Expected the landing page to render.");
    } else {
      assert.equal(
        (await page.goto(origin))?.status(),
        200,
        "Expected the landing page to render.",
      );
    }

    signUpAttempted = true;
    const ownerId = await signUp(ownerPage, email);
    projectAttempted = true;
    const projectId = await createProject(ownerPage, name);
    await uploadPdf(ownerPage);
    const snippet = await copySnippet(ownerPage);

    await ownerPage.getByRole("link", { name: "Conversations", exact: true }).click();
    const empty = ownerPage.getByText("No conversations yet", { exact: true });
    await empty.waitFor();
    await ownerPage
      .getByText("Messages used this month:", { exact: false })
      .getByText(/^0\s*\//)
      .waitFor();

    demo.on("request", (_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Kivo Phase 4 fixture</title>${snippet}`);
    });
    await new Promise<void>((resolve, reject) => {
      demo.once("error", reject);
      demo.listen(0, "127.0.0.1", resolve);
    });
    const address = demo.address();
    assert(address && typeof address === "object");
    const visitor = await browser.newContext({ serviceWorkers: "block" });
    await allowPreview(visitor, protectionBypass);
    const chat = await sendVisitorChat(await visitor.newPage(), `http://127.0.0.1:${address.port}`);
    assert(await empty.isVisible(), "Conversations should stay empty until the owner refreshes.");
    await verifyConversation(ownerPage, projectId, chat);
    console.log(
      "Verified a PDF-grounded widget reply, manual Conversations refresh, and usage 0 → 1.",
    );

    if (requirePosthog) {
      const error = `Kivo Phase 4 fixture ${run}`;
      await Promise.all([
        ownerPage.waitForEvent("pageerror", (event) => event.message.includes(error)),
        ownerPage.evaluate((label) => {
          setTimeout(() => {
            throw new Error(label);
          }, 0);
        }, error),
      ]);
      console.log(`Synthetic browser exception to find in PostHog: ${error}`);
    }

    console.log(
      `Run ${run} | Owner ${ownerId} | Project ${projectId} | Conversation ${chat.conversationId}`,
    );
    console.log(
      posthogHost
        ? "Preview PostHog is configured."
        : "Preview PostHog is unconfigured. Live funnel, trace, replay, and error checks are pending.",
    );
  } finally {
    try {
      if (ownerPage && projectAttempted) await deleteProject(ownerPage, name);
    } finally {
      try {
        if (signUpAttempted) await deleteOwner(email, secret);
      } finally {
        demo.close();
        await browser.close();
      }
    }
  }
}

await main(clerkKey, bypass);
