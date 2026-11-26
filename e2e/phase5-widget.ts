// node e2e/phase5-widget.ts <dev-preview-url>
// Requires Chromium, Clerk dev keys and VERCEL_AUTOMATION_BYPASS_SECRET.
// Follow the printed instructions for the disposable account in the Supabase dev MCP.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { WidgetConfig } from "../packages/shared/src/widget.ts";

const FREE_CONFIG: WidgetConfig = {
  button_color: "#000000",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
  header_text: "How can we help?",
  show_badge: true,
};

const CUSTOM_CONFIG = {
  button_color: "#2468ac",
  position: "top-left",
  label: "Ask support",
  animation: "scale",
  header_text: "Customer support",
  show_badge: false,
} satisfies WidgetConfig;

function previewOrigin(value: string | undefined): string {
  assert(value, "Usage: node e2e/phase5-widget.ts <dev-preview-url>");
  const url = new URL(value);
  assert(
    url.protocol === "https:" && /^kivo-[a-z0-9-]+-santifsl\.vercel\.app$/.test(url.hostname),
    "Use the Kivo dev preview URL from GitHub.",
  );
  assert(!url.username && !url.password, "Use a URL without credentials.");
  return url.origin;
}

const origin = previewOrigin(process.argv[2]);
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
  await context.route(
    (url) => url.origin === origin,
    (route) =>
      route.continue({
        headers: { ...route.request().headers(), "x-vercel-protection-bypass": secret },
      }),
  );
}

async function signUp(page: Page, email: string) {
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
  const currentUser = () =>
    (window as Window & { Clerk?: { user?: { id: string } } }).Clerk?.user?.id;
  await page.waitForFunction(currentUser);
  const id = await page.evaluate(currentUser);
  assert(id && /^user_[A-Za-z0-9]+$/.test(id), "Expected a disposable Clerk owner ID.");
  return id;
}

async function createProject(page: Page, name: string) {
  await page.getByRole("textbox", { name: "New project" }).fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await page.waitForURL(/\/install$/);
  const projectId = /\/projects\/([0-9a-f-]{36})\/install$/.exec(new URL(page.url()).pathname)?.[1];
  assert(projectId, "Expected the new project's install page.");
  return projectId;
}

async function copySnippet(page: Page) {
  const snippet = await page.getByTestId("install-snippet").textContent();
  const [, source] =
    /^<script src="([^"]+)" data-key="pk_[A-Za-z0-9_-]+" async><\/script>$/.exec(snippet ?? "") ??
    [];
  assert.equal(source, `${origin}/widget.js`, "Expected the install script from this preview.");
  const copy = page.getByRole("button", { name: "Copy install code" });
  await copy.click();
  await copy.getByText("Copied", { exact: true }).waitFor();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, snippet, "Expected the clipboard to contain the install snippet.");
  return copied;
}

async function waitForPlan(page: Page, ownerId: string, projectId: string, plan: "free" | "pro") {
  console.log(
    `In the Supabase dev MCP, set the disposable owner to ${plan}:\n` +
      `update public.accounts set plan = '${plan}' where clerk_user_id = '${ownerId}'\n` +
      `  and exists (select 1 from public.projects where id = '${projectId}' and owner_id = '${ownerId}')\n` +
      "returning plan;",
  );
  const deadline = Date.now() + 180_000;
  do {
    const current = await page.evaluate(async () => {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not read the owner plan (HTTP ${response.status}).`);
      return ((await response.json()) as { plan: string }).plan;
    });
    if (current === plan) return;
    await delay(2_000);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for the disposable owner to switch to ${plan}.`);
}

async function saveConfig(page: Page, projectId: string) {
  await page.getByRole("link", { name: "Customize", exact: true }).click();
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
  assert.equal(response.status(), 200, "Expected the saved widget config.");
  assert.deepEqual(await response.json(), { config: CUSTOM_CONFIG });
  await page.getByText("Changes saved.", { exact: true }).waitFor();
}

async function checkInstallation(page: Page, expected: WidgetConfig) {
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
      /^user_[A-Za-z0-9]+$/.test(owner.id) &&
      owner.email_addresses.some((entry) => entry.email_address === email),
  );
  const deleted = await fetch(
    `${endpoint.origin}${endpoint.pathname}/${encodeURIComponent(owner.id)}`,
    {
      ...options,
      method: "DELETE",
    },
  );
  assert(deleted.ok, `Clerk fixture deletion returned HTTP ${deleted.status}`);
  return owner.id;
}

async function main(secret: string, protectionBypass: string) {
  const run = crypto.randomUUID();
  const email = `kivo-p5-widget-${run}+clerk_test@example.com`;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const demo = createServer();
  let signUpAttempted = false;
  let ownerId: string | undefined;
  let owner: Page | undefined;
  let projectId: string | undefined;
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await allowPreview(context, protectionBypass);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    owner = await context.newPage();
    await clerkSetup();
    await setupClerkTestingToken({ page: owner });
    assert.equal((await owner.goto(origin))?.status(), 200);
    signUpAttempted = true;
    ownerId = await signUp(owner, email);
    console.log(`Disposable Clerk owner: ${ownerId}`);
    projectId = await createProject(owner, `Phase 5 widget fixture ${run}`);
    const snippet = await copySnippet(owner);

    demo.on("request", (_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>Widget customization fixture</title>${snippet}`);
    });
    await new Promise<void>((resolve, reject) => {
      demo.once("error", reject);
      demo.listen(0, "127.0.0.1", resolve);
    });
    const address = demo.address();
    assert(address && typeof address === "object");
    const visitor = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 1280, height: 900 },
      reducedMotion: "no-preference",
    });
    await allowPreview(visitor, protectionBypass);
    const installed = await visitor.newPage();
    assert.equal((await installed.goto(`http://127.0.0.1:${address.port}`))?.status(), 200);
    await checkInstallation(installed, FREE_CONFIG);

    await waitForPlan(owner, ownerId, projectId, "pro");
    await saveConfig(owner, projectId);
    await installed.reload();
    await checkInstallation(installed, CUSTOM_CONFIG);
    console.log(
      "Pro reload showed the saved color, corner, label, animation, header and hidden badge.",
    );

    await waitForPlan(owner, ownerId, projectId, "free");
    await installed.reload();
    await checkInstallation(installed, FREE_CONFIG);
    console.log(
      "After returning to Free, reload showed the default launcher, animation, header and badge.",
    );
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
        demo.close();
        await browser.close();
      }
    }
  }
}

await main(clerkKey, bypass);
