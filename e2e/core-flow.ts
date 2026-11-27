// pnpm e2e:core <app-url>
//
// Runs the nine core-flow steps (docs/project.md §2) against a Preview or production,
// then deletes the disposable Clerk user and its Supabase account, projects and files.
//
// Needs Chromium (`pnpm exec playwright install chromium`) and these variables:
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY  the target's Clerk instance
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY        the target's Supabase project
//                                                         (for cleanup; without them the
//                                                         script prints the SQL instead)
//   VERCEL_AUTOMATION_BYPASS_SECRET                      Previews only
// The Clerk instance must have test mode on (sign-up uses a +clerk_test address).
// Step 8 needs Clerk Billing in development mode; otherwise steps 8 and 9 are skipped.
//
// Output (log with UTC timestamps + one screenshot per step) goes to e2e/output/core-<time>/.

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import { APP_NAME } from "../packages/shared/src/app.ts";
import {
  CUSTOM_CONFIG,
  FALLBACK,
  FREE_CONFIG,
  PDF_ANSWER,
  PDF_QUESTION,
  allowPreview,
  appOrigin,
  askWidget,
  attemptFreeSave,
  checkInstallation,
  checkout,
  copySnippet,
  createProject,
  cleanSupabase,
  deleteOwner,
  isPreview,
  openExternalPage,
  readPlan,
  saveConfig,
  serveHtml,
  signUp,
  uploadPdf,
  verifyConversation,
  verifySubscriptionManagement,
  waitForPro,
} from "./helpers.ts";

const LANDING_QUESTION = `How do I install ${APP_NAME} on my website?`;
const LANDING_ANSWER = /\b(?:install|script|snippet)\b/i;

const origin = appOrigin(process.argv[2], "Usage: pnpm e2e:core <app-url>");
const preview = isPreview(origin);
const clerkSecret = process.env.CLERK_SECRET_KEY ?? "";
const clerkPublishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
assert(clerkSecret.startsWith("sk_"), "CLERK_SECRET_KEY is required.");
assert(clerkPublishable.startsWith("pk_"), "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required.");
if (preview) {
  assert(bypass, "VERCEL_AUTOMATION_BYPASS_SECRET is required for a Preview.");
  assert(clerkSecret.startsWith("sk_test_"), "A Preview uses the Clerk development keys.");
}

// ---------------------------------------------------------------------------
// Output: log with UTC timestamps, one screenshot per step
// ---------------------------------------------------------------------------

const startedAt = new Date();
const outDir = fileURLToPath(
  new URL(`./output/core-${startedAt.toISOString().replace(/[:.]/g, "-")}/`, import.meta.url),
);
const lines: string[] = [];

function log(line: string) {
  console.log(line);
  lines.push(line);
}

type Result = "passed" | "failed" | "skipped";

/** Thrown inside a step to skip it with a note instead of failing. */
class Skip extends Error {}
const results: { step: number; name: string; result: Result }[] = [];

async function step(
  number: number,
  name: string,
  page: () => Page | undefined,
  run: () => Promise<string | undefined>,
): Promise<void> {
  const started = new Date();
  log(`[${started.toISOString()}] Step ${number}: ${name}`);
  const shot = async (suffix = "") => {
    const target = page();
    if (!target) return;
    const file = `${String(number).padStart(2, "0")}-${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}${suffix}.png`;
    await target.screenshot({ path: `${outDir}${file}` });
    log(`    screenshot: ${file}`);
  };
  try {
    const note = await run();
    await shot();
    log(`    ✓ passed in ${Date.now() - started.getTime()} ms${note ? `: ${note}` : ""}`);
    results.push({ step: number, name, result: "passed" });
  } catch (error) {
    if (error instanceof Skip) {
      await shot("-SKIPPED").catch(() => undefined);
      log(`    – skipped: ${error.message}`);
      results.push({ step: number, name, result: "skipped" });
      return;
    }
    log(`    ✗ failed in ${Date.now() - started.getTime()} ms`);
    log(
      `    ${(error instanceof Error ? error.message : String(error)).split("\n").join("\n    ")}`,
    );
    log(`    page: ${page()?.url()}`);
    await shot("-FAILED").catch(() => undefined);
    results.push({ step: number, name, result: "failed" });
    throw error;
  }
}

function skip(number: number, name: string, reason: string) {
  log(`[${new Date().toISOString()}] Step ${number}: ${name}`);
  log(`    – skipped: ${reason}`);
  results.push({ step: number, name, result: "skipped" });
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

async function newContext(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context: BrowserContext = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
  });
  context.setDefaultTimeout(30_000);
  if (preview && bypass) await allowPreview(context, origin, bypass);
  return context;
}

async function main(secret: string) {
  await mkdir(outDir, { recursive: true });
  log(`Core flow against ${origin} (${preview ? "Preview" : "production"})`);
  log(`Started ${startedAt.toISOString()}`);

  const run = crypto.randomUUID();
  const email = `kivo-core-${run}+clerk_test@example.com`;
  const projectName = `Core flow ${run}`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  let owner: Page | undefined;
  let visitor: Page | undefined;
  let site: Awaited<ReturnType<typeof serveHtml>> | undefined;
  let signUpAttempted = false;
  let ownerId: string | undefined;
  let projectId: string | undefined;
  let failure: unknown;

  try {
    const ownerContext = await newContext(browser);
    await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    owner = await ownerContext.newPage();
    await clerkSetup({ publishableKey: clerkPublishable, secretKey: secret });
    await setupClerkTestingToken({ page: owner });
    const ownerPage = owner;

    await step(
      1,
      "Landing shows the app's own widget",
      () => ownerPage,
      async () => {
        assert.equal((await ownerPage.goto(origin))?.status(), 200, "Expected the landing page.");
        await ownerPage.locator("chat-widget-host button").first().waitFor();
      },
    );

    await step(
      2,
      "Landing widget answers a product question",
      () => ownerPage,
      async () => {
        const chat = await askWidget(ownerPage, origin, LANDING_QUESTION);
        assert.notEqual(chat.reply, FALLBACK, "The landing widget had no answer.");
        assert.match(chat.reply, LANDING_ANSWER, "Expected an answer about installing.");
        return `"${LANDING_QUESTION}" → ${JSON.stringify(chat.reply.slice(0, 160))}`;
      },
    );

    await step(
      3,
      "Sign up, create a project, upload the PDF",
      () => ownerPage,
      async () => {
        // Back to a clean landing page so "Start free" isn't covered by the open panel.
        await ownerPage.goto(origin);
        signUpAttempted = true;
        ownerId = await signUp(ownerPage, origin, email);
        projectId = await createProject(ownerPage, projectName);
        await uploadPdf(ownerPage, origin);
        return `owner ${ownerId}, project ${projectId}, sample.pdf Ready`;
      },
    );
    assert(projectId);
    const project = projectId;

    let snippet = "";
    await step(
      4,
      "Install snippet shows the widget on another origin",
      () => visitor ?? ownerPage,
      async () => {
        snippet = await copySnippet(ownerPage, origin);
        site = await serveHtml(`${APP_NAME} core flow`, snippet);
        assert.notEqual(site.origin, origin);
        visitor = await (await newContext(browser)).newPage();
        await openExternalPage(visitor, origin, site.origin);
        await checkInstallation(visitor, FREE_CONFIG);
        return `served on ${site.origin} with the Free defaults`;
      },
    );
    assert(visitor && site);
    const installed = visitor;

    let chat: Awaited<ReturnType<typeof askWidget>> | undefined;
    await step(
      5,
      "Widget answers from the PDF",
      () => installed,
      async () => {
        chat = await askWidget(installed, origin, PDF_QUESTION);
        assert.match(chat.reply, PDF_ANSWER, "Expected the PDF's refund window in the reply.");
        return `"${PDF_QUESTION}" → ${JSON.stringify(chat.reply.slice(0, 160))}`;
      },
    );
    assert(chat);
    const reply = chat;

    await step(
      6,
      "Conversations shows the chat",
      () => ownerPage,
      async () => {
        await ownerPage.getByRole("link", { name: "Conversations", exact: true }).click();
        await verifyConversation(ownerPage, project, PDF_QUESTION, reply);
        return `conversation ${reply.conversationId}`;
      },
    );

    await step(
      7,
      "Customize shows the paywall",
      () => ownerPage,
      async () => {
        await ownerPage.getByRole("link", { name: "Customize", exact: true }).click();
        await ownerPage.getByRole("link", { name: "Upgrade to Pro", exact: true }).waitFor();
        assert(await ownerPage.getByLabel("Button color", { exact: true }).isDisabled());
        assert.equal(await readPlan(ownerPage), "free");
        await attemptFreeSave(ownerPage, project);
        return "controls locked, server save refused with HTTP 402";
      },
    );

    let paid = false;
    await step(
      8,
      "Upgrade with the test card unlocks Customize",
      () => ownerPage,
      async () => {
        await ownerPage.getByRole("link", { name: "Upgrade to Pro", exact: true }).click();
        paid = await checkout(ownerPage);
        if (!paid) {
          assert(!preview, "Clerk Billing on a Preview must be in development mode.");
          throw new Skip(
            "Clerk Billing is not in development mode, so the test card can't be used.",
          );
        }
        await verifySubscriptionManagement(ownerPage);
        await waitForPro(ownerPage);
        await ownerPage.goto(`${origin}/dashboard/projects/${project}/customize`);
        assert(await ownerPage.getByLabel("Button color", { exact: true }).isEnabled());
        return "test payment accepted, plan is Pro, Customize unlocked";
      },
    );
    if (!paid) {
      skip(9, "New button color shows on the reloaded page", "needs step 8");
    } else {
      await step(
        9,
        "New button color shows on the reloaded page",
        () => installed,
        async () => {
          await saveConfig(ownerPage, origin, project);
          assert.equal((await installed.reload())?.status(), 200);
          await checkInstallation(installed, CUSTOM_CONFIG);
          return `button is ${CUSTOM_CONFIG.button_color} after reload`;
        },
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    log(`[${new Date().toISOString()}] Cleanup`);
    try {
      if (owner && projectId) {
        // The app's own delete removes the project's stored files too.
        const status = await owner.evaluate(async (id) => {
          const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
          return response.status;
        }, projectId);
        assert(status === 200 || status === 404, `Project delete returned HTTP ${status}.`);
        log(`    project ${projectId} deleted through the app (HTTP ${status})`);
      }
    } catch (error) {
      log(`    project delete through the app failed: ${String(error)}`);
    }
    const cleanupErrors: unknown[] = [];
    try {
      if (signUpAttempted) {
        ownerId = (await deleteOwner(email, secret)) ?? ownerId;
        log(`    Clerk user ${ownerId ?? "(never created)"} deleted`);
      }
    } catch (error) {
      log(`    ✗ Clerk cleanup failed for ${email}: ${String(error)}`);
      cleanupErrors.push(error);
    }
    try {
      if (ownerId && supabaseUrl && supabaseSecret) {
        const removed = await cleanSupabase(
          { url: supabaseUrl, secret: supabaseSecret },
          ownerId,
          projectId ? [projectId] : [],
        );
        log(
          `    Supabase account deleted; verified 0 accounts, 0 projects, 0 files left ` +
            `(swept ${removed.projects} project folder(s), removed ${removed.files} leftover file(s))`,
        );
      } else if (ownerId) {
        log(
          "    NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY not set. Run in the SQL editor:\n" +
            `    delete from public.accounts where clerk_user_id = '${ownerId}';`,
        );
      }
    } catch (error) {
      log(`    ✗ Supabase cleanup failed for ${ownerId}: ${String(error)}`);
      cleanupErrors.push(error);
    }
    site?.close();
    await browser.close();
    if (cleanupErrors.length > 0) {
      const cleanup =
        cleanupErrors.length === 1
          ? cleanupErrors[0]
          : new AggregateError(cleanupErrors, "Clerk and Supabase cleanup both failed.");
      failure = failure
        ? new AggregateError([failure, cleanup], "Run and cleanup failed.")
        : cleanup;
    }
  }

  const passed = results.filter((item) => item.result === "passed").length;
  const skipped = results.filter((item) => item.result === "skipped").length;
  log("");
  for (const item of results) log(`  ${item.result.padEnd(7)} ${item.step}. ${item.name}`);
  log(`${passed} passed, ${skipped} skipped, ${9 - passed - skipped} not passed`);
  log(`Finished ${new Date().toISOString()}. Output: ${outDir}`);
  await writeFile(`${outDir}output.txt`, `${lines.join("\n")}\n`);
  if (failure) throw failure;
  assert.equal(passed + skipped, 9, "Not every step ran.");
}

await main(clerkSecret);
