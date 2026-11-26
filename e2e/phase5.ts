// pnpm e2e:phase5 <dev-preview-url>
// Requires Chromium, Clerk dev keys and VERCEL_AUTOMATION_BYPASS_SECRET.
// The Clerk development webhook must reach this preview and have its signing secret configured.

import assert from "node:assert/strict";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type Page } from "playwright";
import {
  CUSTOM_CONFIG,
  FREE_CONFIG,
  allowPreview,
  attemptFreeSave,
  checkInstallation,
  checkout,
  copySnippet,
  createProject,
  deleteOwner,
  openExternalPage,
  previewOrigin,
  readPlan,
  saveConfig,
  serveHtml,
  signUp,
  verifySubscriptionManagement,
  waitForPro,
} from "./helpers.ts";

const origin = previewOrigin(process.argv[2], "Usage: pnpm e2e:phase5 <dev-preview-url>");
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

async function main(secret: string, protectionBypass: string) {
  console.log(`Integrated preview ${origin}`);
  const posthog = await fetch(`${origin}/api/posthog-config`, {
    headers: { "x-vercel-protection-bypass": protectionBypass },
    redirect: "error",
  });
  assert(
    posthog.status === 200 || posthog.status === 204,
    `Could not read preview PostHog configuration (HTTP ${posthog.status}).`,
  );
  const posthogConfigured = posthog.status === 200;
  if (!posthogConfigured) console.log("PostHog is unconfigured on this preview.");
  const run = crypto.randomUUID();
  const email = `kivo-p5-checkout-${run}+clerk_test@example.com`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  let demo: Awaited<ReturnType<typeof serveHtml>> | undefined;
  let signUpAttempted = false;
  let ownerId: string | undefined;
  let owner: Page | undefined;
  let projectId: string | undefined;
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await allowPreview(context, origin, protectionBypass);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    owner = await context.newPage();
    await clerkSetup();
    await setupClerkTestingToken({ page: owner });
    assert.equal((await owner.goto(origin))?.status(), 200);
    signUpAttempted = true;
    ownerId = await signUp(owner, origin, email);
    projectId = await createProject(owner, `Phase 5 checkout fixture ${run}`);
    const snippet = await copySnippet(owner, origin);
    const customizePath = `/dashboard/projects/${projectId}/customize`;
    await owner.getByRole("link", { name: "Customize", exact: true }).click();
    const upgrade = owner.getByRole("link", { name: "Upgrade to Pro", exact: true });
    await upgrade.waitFor();
    assert(await owner.getByLabel("Button color", { exact: true }).isDisabled());
    assert.equal(await readPlan(owner), "free");
    await attemptFreeSave(owner, projectId);
    console.log(`Free account ${ownerId} received HTTP 402 on project ${projectId}.`);

    demo = await serveHtml("Kivo Phase 5 checkout fixture", snippet);
    const visitor = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1280, height: 900 },
      reducedMotion: "no-preference",
    });
    await allowPreview(visitor, origin, protectionBypass);
    const installed = await visitor.newPage();
    await openExternalPage(installed, origin, demo.origin);
    await checkInstallation(installed, FREE_CONFIG);
    console.log("The separate-origin widget showed the Free defaults.");

    await upgrade.click();
    assert(await checkout(owner), "Expected Clerk Billing in development mode.");
    await verifySubscriptionManagement(owner);
    console.log(
      "Clerk accepted the development payment and Manage subscription showed active Pro.",
    );
    await waitForPro(owner);
    console.log("Clerk test checkout promoted the server plan from Free to Pro.");
    console.log(`Check Clerk delivery of subscriptionItem.active for ${ownerId} to this preview.`);
    if (posthogConfigured) {
      console.log(`In dev PostHog, verify upgraded for distinct ID ${ownerId}.`);
    }
    await owner.goto(`${origin}${customizePath}`);
    await saveConfig(owner, origin, projectId);
    assert.equal((await installed.reload())?.status(), 200);
    await checkInstallation(installed, CUSTOM_CONFIG);
    console.log("The same save returned HTTP 200 and updated the installed widget on reload.");
  } finally {
    try {
      if (owner && projectId) {
        const status = await owner.evaluate(async (id) => {
          const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
          return response.status;
        }, projectId);
        assert(status === 200 || status === 404, `Project cleanup returned HTTP ${status}.`);
      }
    } finally {
      try {
        if (signUpAttempted) ownerId = (await deleteOwner(email, secret)) ?? ownerId;
      } finally {
        if (ownerId) {
          console.log(
            "Remove the disposable account in the Supabase dev MCP:\n" +
              `delete from public.accounts where clerk_user_id = '${ownerId}' returning clerk_user_id;`,
          );
        }
        demo?.close();
        await browser.close();
      }
    }
  }
}

await main(clerkKey, bypass);
