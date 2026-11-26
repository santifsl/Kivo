// pnpm e2e:phase4 <dev-preview-url> [--require-posthog]
// Requires Chromium, Clerk dev keys and VERCEL_AUTOMATION_BYPASS_SECRET for protected previews.

import assert from "node:assert/strict";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { ChatResponse } from "../packages/shared/src/api/widget.ts";
import {
  PDF_ANSWER,
  PDF_QUESTION as QUESTION,
  allowPreview,
  askWidget,
  copySnippet,
  createProject,
  deleteOwner,
  deleteProjectInDashboard,
  openExternalPage,
  previewOrigin,
  serveHtml,
  signUp,
  uploadPdf,
  verifyConversation,
} from "./helpers.ts";

const origin = previewOrigin(
  process.argv[2],
  "Usage: pnpm e2e:phase4 <dev-preview-url> [--require-posthog]",
);
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

async function sendVisitorChat(page: Page, demoOrigin: string): Promise<ChatResponse> {
  await openExternalPage(page, origin, demoOrigin);
  const chat = await askWidget(page, origin, QUESTION);
  assert.match(chat.reply, PDF_ANSWER, "Expected a PDF-grounded reply.");
  return chat;
}

async function main(secret: string, protectionBypass: string) {
  const run = crypto.randomUUID();
  const email = `kivo-phase4-${run}+clerk_test@example.com`;
  const name = `Phase 4 fixture ${run}`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  let demo: Awaited<ReturnType<typeof serveHtml>> | undefined;
  let ownerPage: Page | undefined;
  let signUpAttempted = false;
  let projectAttempted = false;
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await allowPreview(context, origin, protectionBypass);
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
    const ownerId = await signUp(ownerPage, origin, email);
    projectAttempted = true;
    const projectId = await createProject(ownerPage, name);
    await uploadPdf(ownerPage, origin);
    const snippet = await copySnippet(ownerPage, origin);

    await ownerPage.getByRole("link", { name: "Conversations", exact: true }).click();
    const empty = ownerPage.getByText("No conversations yet", { exact: true });
    await empty.waitFor();
    await ownerPage
      .getByText("Messages used this month:", { exact: false })
      .getByText(/^0\s*\//)
      .waitFor();

    demo = await serveHtml("Kivo Phase 4 fixture", snippet);
    const visitor = await browser.newContext({ serviceWorkers: "block" });
    await allowPreview(visitor, origin, protectionBypass);
    const chat = await sendVisitorChat(await visitor.newPage(), demo.origin);
    assert(await empty.isVisible(), "Conversations should stay empty until the owner refreshes.");
    await verifyConversation(ownerPage, projectId, QUESTION, chat);
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
      if (ownerPage && projectAttempted) await deleteProjectInDashboard(ownerPage, origin, name);
    } finally {
      try {
        if (signUpAttempted) await deleteOwner(email, secret);
      } finally {
        demo?.close();
        await browser.close();
      }
    }
  }
}

await main(clerkKey, bypass);
