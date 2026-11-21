// pnpm e2e:phase3 https://<dev-preview>.vercel.app
// Requires Chromium (`pnpm exec playwright install chromium`), Clerk dev keys,
// and VERCEL_AUTOMATION_BYPASS_SECRET for protected previews. Fixtures are disposable.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type FrameLocator, type Page } from "playwright";
import type { ChatRequest, ChatResponse } from "../packages/shared/src/api/widget.ts";
import type { ApiError } from "../packages/shared/src/errors.ts";

const PDF = fileURLToPath(
  new URL("../apps/web/test/fixtures/knowledge/sample.pdf", import.meta.url),
);
const RELATED_QUESTION = "How long does it take to process refunds?";
const FALLBACK = "I don't know the answer to that. Please reach out to the team directly for help.";
const RATE_LIMIT_MESSAGE = "Too many messages. Please wait a minute before trying again.";
const CHAT_PATH = "/api/widget/chat";
const WINDOW_MS = 60_000;

function getAppOrigin(arg: string | undefined): string {
  assert(arg, "Usage: pnpm e2e:phase3 <dev-preview-url>");
  const url = new URL(arg);
  assert(
    (url.protocol === "https:" && /^kivo-[a-z0-9-]+-santifsl\.vercel\.app$/.test(url.hostname)) ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)),
    "Use a Kivo development preview URL or a local dev server",
  );
  assert(!url.username && !url.password, "Use a URL without credentials");
  return url.origin;
}

const appOrigin = getAppOrigin(process.argv[2]);
const clerkKey = process.env.CLERK_SECRET_KEY;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
assert(
  clerkKey && clerkKey.startsWith("sk_test_"),
  "CLERK_SECRET_KEY must be a Clerk development key",
);
assert(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"),
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk development key",
);

async function signUp(page: Page, email: string): Promise<void> {
  const access = await page.goto(`${appOrigin}/sign-up`);
  assert.equal(access?.status(), 200, "Expected HTTP 200 on preview sign-up");
  console.log("Preview sign-up HTTP 200");
  await page.locator('input[name="emailAddress"]').fill(email);
  const password = page.locator('input[name="password"]');
  if (await password.isVisible()) await password.fill(`E2e-${crypto.randomUUID()}`);
  const [prepared] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/prepare_verification")),
    page.getByRole("button", { name: "Continue", exact: true }).click(),
  ]);
  assert(prepared.ok(), `Clerk email verification setup returned HTTP ${prepared.status()}`);
  await page
    .locator('input[name="code"], input[autocomplete="one-time-code"]')
    .first()
    .pressSequentially("424242");
  await page.waitForURL(`${appOrigin}/dashboard**`);
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole("textbox", { name: "New project" }).fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForURL(/\/install$/);
}

async function uploadPdf(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Knowledge", exact: true }).click();
  const [finalized] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === appOrigin &&
        url.pathname.endsWith("/knowledge/finalize") &&
        response.request().method() === "POST"
      );
    }),
    page.getByLabel(/Choose a file/).setInputFiles(PDF),
  ]);
  assert.equal(finalized.status(), 200, "Expected HTTP 200 for PDF finalization");
  const row = page.getByRole("listitem").filter({ hasText: "sample" });
  const status = row.locator("[data-status]");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await status.getAttribute("data-status");
    if (state === "ready") {
      console.log("PDF finalized with HTTP 200 and reached Ready in Knowledge");
      return;
    }
    assert.notEqual(state, "failed", "PDF ingestion failed");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const refresh = await page.reload({ waitUntil: "domcontentloaded" });
    assert(refresh?.ok(), `Knowledge refresh returned HTTP ${refresh?.status()}`);
  }
  throw new Error("PDF did not become Ready within 90 seconds");
}

async function sendFromWidget(page: Page, frame: FrameLocator, message: string) {
  await frame.getByRole("textbox", { name: "Message" }).fill(message);
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === `${appOrigin}${CHAT_PATH}` && response.request().method() === "POST",
    ),
    frame.getByRole("button", { name: "Send", exact: true }).click(),
  ]);
  return response;
}

async function expectReply(
  page: Page,
  frame: FrameLocator,
  question: string,
  expected: string | RegExp,
) {
  const response = await sendFromWidget(page, frame, question);
  assert.equal(response.status(), 200, `Widget chat returned HTTP ${response.status()}`);
  const { reply } = (await response.json()) as ChatResponse;
  if (typeof expected === "string") assert.equal(reply, expected);
  else assert.match(reply, expected);
  const bubble = frame.locator('[data-role="bot"]').last().filter({ hasText: reply });
  await bubble.waitFor();
  const visibleReply = await bubble.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelector(".sr-only")?.remove();
    return copy.textContent?.trim();
  });
  assert.equal(visibleReply, reply);
  const request = response.request().postDataJSON() as ChatRequest;
  return request;
}

async function checkWidget(page: Page, demoOrigin: string, publicKey: string): Promise<void> {
  await page.goto(demoOrigin);
  await page.locator("chat-widget-host button").click();
  const frame = page.frameLocator("chat-widget-host iframe");
  await frame.getByRole("textbox", { name: "Message" }).waitFor();

  // Both widget messages count toward the fresh key's first 20. Send the other
  // 18 from the same iframe/IP in batches to stay inside the minute.
  const started = performance.now();
  const request = await expectReply(page, frame, RELATED_QUESTION, /\b(?:5|five) business days\b/i);
  assert.equal(request.key, publicKey, "The widget must send with this run's project key");
  console.log("External HTML widget answered the PDF question with the five-business-day policy");
  await expectReply(page, frame, "What is the orbital period of Neptune?", FALLBACK);
  console.log("External HTML widget displayed the fallback for the unrelated question");

  for (let first = 3; first <= 20; first += 6) {
    const statuses = await frame.locator("body").evaluate(
      async (_body, { path, request, budget }) => {
        const signal = AbortSignal.timeout(budget);
        return Promise.all(
          Array.from({ length: 6 }, async () => {
            const response = await fetch(path, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
              signal,
            });
            await response.text();
            return response.status;
          }),
        );
      },
      {
        path: CHAT_PATH,
        request,
        budget: Math.max(1, Math.floor(WINDOW_MS - (performance.now() - started))),
      },
    );
    for (const [offset, status] of statuses.entries()) {
      assert.equal(status, 200, `Expected HTTP 200 on message ${first + offset}`);
    }
  }
  const refused = await sendFromWidget(page, frame, RELATED_QUESTION);
  const elapsed = Math.round(performance.now() - started);
  assert(elapsed < WINDOW_MS, `The 21-response check took ${elapsed} ms, outside the rate window`);
  assert.equal(refused.status(), 429, "Expected HTTP 429 on message 21");
  const { error } = (await refused.json()) as ApiError;
  assert.equal(error.code, "rate_limited");
  await frame.getByRole("alert").filter({ hasText: RATE_LIMIT_MESSAGE }).waitFor();
  console.log(
    `Messages 1–20 returned HTTP 200. Message 21 returned HTTP 429 rate_limited after ${elapsed} ms and showed the widget notice.`,
  );
}

async function deleteProject(page: Page, name: string): Promise<void> {
  await page.goto(`${appOrigin}/dashboard`);
  await page.getByRole("textbox", { name: "New project" }).waitFor();
  const button = page.getByRole("button", { name: `Delete ${name}`, exact: true });
  if (!(await button.count())) return;
  await button.click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).waitFor({ state: "detached" });
  console.log("Deleted fixture project through the dashboard");
}

async function deleteOwner(email: string, secretKey: string): Promise<void> {
  const users = new URL("https://api.clerk.com/v1/users");
  users.searchParams.set("email_address", email);
  const options = {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(15_000),
  };
  const response = await fetch(users, options);
  assert(response.ok, `Clerk fixture lookup returned HTTP ${response.status}`);
  const matches = (await response.json()) as {
    id: string;
    email_addresses: { email_address: string }[];
  }[];
  if (matches.length === 0) return;
  const [owner] = matches;
  assert(owner && matches.length === 1, "Expected exactly one matching fixture owner");
  assert(owner.email_addresses.some(({ email_address }) => email_address === email));
  const deleted = await fetch(`${users.origin}${users.pathname}/${encodeURIComponent(owner.id)}`, {
    ...options,
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
  });
  assert(deleted.ok, `Clerk fixture deletion returned HTTP ${deleted.status}`);
  console.log("Deleted disposable Clerk owner");
}

async function main(secretKey: string): Promise<void> {
  const id = crypto.randomUUID();
  const email = `kivo-phase3-${id}+clerk_test@example.com`;
  const name = `Phase 3 ${id}`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const server = createServer();
  let app: Page | undefined;
  let signUpAttempted = false;
  let createAttempted = false;
  let failure: unknown;
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    context.setDefaultTimeout(30_000);
    if (bypass) {
      let first = true;
      await context.route(
        (url) => url.origin === appOrigin,
        async (route) => {
          const headers = { ...route.request().headers(), "x-vercel-protection-bypass": bypass };
          if (first) Object.assign(headers, { "x-vercel-set-bypass-cookie": "true" });
          first = false;
          await route.continue({ headers });
        },
      );
    }
    app = await context.newPage();
    await clerkSetup();
    await setupClerkTestingToken({ page: app });
    signUpAttempted = true;
    await signUp(app, email);
    console.log("Signed in as a disposable Clerk owner");
    createAttempted = true;
    await createProject(app, name);
    console.log("Created a fresh project and opened Install");
    const snippet = (await app.getByTestId("install-snippet").textContent())?.trim() ?? "";
    const [, src, publicKey] =
      /^<script src="([^"]+)" data-key="(pk_[A-Za-z0-9_-]+)"(?: async)?><\/script>$/.exec(
        snippet,
      ) ?? [];
    assert(publicKey, "Install snippet must contain a public key");
    assert.equal(
      src,
      `${appOrigin}/widget.js`,
      "Install snippet must load this preview's widget.js",
    );
    await uploadPdf(app);

    server.on("request", (_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>External widget fixture</title>${snippet}`);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert(address && typeof address === "object");
    const demoOrigin = `http://127.0.0.1:${address.port}`;
    assert.notEqual(demoOrigin, appOrigin);
    await checkWidget(await context.newPage(), demoOrigin, publicKey);
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (app && createAttempted) await deleteProject(app, name);
      if (signUpAttempted) await deleteOwner(email, secretKey);
    } catch (cleanupError) {
      console.error(`Fixture cleanup failed for ${name} (${email}):`, cleanupError);
      failure ??= cleanupError;
    } finally {
      server.close();
      await browser.close();
    }
  }
  if (failure) throw failure;
}

console.log(`Phase 3 check against ${appOrigin}`);
await main(clerkKey);
