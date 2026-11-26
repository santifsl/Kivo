import { apiErrorSchema } from "@kivo/shared";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakePostgrest, pgError } from "../../../../lib/projects/fake-postgrest";

const { getUserBillingSubscription, trackUpgrade, verifyWebhook } = vi.hoisted(() => ({
  getUserBillingSubscription: vi.fn(),
  trackUpgrade: vi.fn(),
  verifyWebhook: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ billing: { getUserBillingSubscription } }),
}));
vi.mock("@clerk/nextjs/webhooks", () => ({ verifyWebhook }));
vi.mock("../../../../lib/posthog/billing-events", () => ({ trackUpgrade }));
vi.mock("../../../../lib/posthog/owner-events", () => ({ scheduleOwnerEvent: vi.fn() }));
vi.mock("../../../../lib/supabase/service", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    createServiceClient: () => createClient("https://supabase.example", "sb_secret_fixture"),
  };
});

import { POST } from "./route";

const ownerId = "user_billing_owner";
const accountsPath = "/rest/v1/accounts";

function webhook(type: string, item = {}, slug = "pro", payer = { user_id: ownerId }) {
  return {
    type,
    data: {
      object: "commerce_subscription_item",
      id: "csi_pro",
      payer,
      plan: { slug },
      ...item,
    },
    object: "event",
  };
}

function subscriptionItem(
  status: string,
  {
    id = "csi_pro",
    slug = "pro",
    periodEnd = null,
  }: {
    id?: string;
    slug?: string;
    periodEnd?: number | null;
  } = {},
) {
  return { id, status, periodEnd, plan: { slug } };
}

function subscription(...subscriptionItems: ReturnType<typeof subscriptionItem>[]) {
  return { subscriptionItems };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function account(initialPlan: "free" | "pro" | null = "free") {
  let plan = initialPlan;
  let revision = 0;
  const db = fakePostgrest();
  db.on("GET", accountsPath, ({ params }) => {
    expect(params.get("clerk_user_id")).toBe(`eq.${ownerId}`);
    return { body: plan === null ? [] : [{ plan, billing_revision: revision }] };
  });
  db.on("POST", accountsPath, ({ body }) => {
    expect(body).toEqual({ clerk_user_id: ownerId });
    if (plan !== null) return { body: [] };
    plan = "free";
    return { body: [{ clerk_user_id: ownerId }] };
  });
  db.on("PATCH", accountsPath, ({ params, body }) => {
    expect(params.get("clerk_user_id")).toBe(`eq.${ownerId}`);
    if (params.get("billing_revision") !== `eq.${revision}`) return { body: [] };
    const update = body as { plan: "free" | "pro"; billing_revision: number };
    expect(update.billing_revision).toBe(revision + 1);
    plan = update.plan;
    revision = update.billing_revision;
    return { body: [{ clerk_user_id: ownerId }] };
  });
  vi.stubGlobal("fetch", db.fetchMock);
  return { db, plan: () => plan };
}

function request() {
  return new NextRequest("https://preview.example/api/clerk/webhook", {
    method: "POST",
    body: "original bytes",
  });
}

async function deliver() {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
}

describe("POST /api/clerk/webhook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes the original request to Clerk and rejects invalid signatures before any work", async () => {
    const { db } = account();
    const original = request();
    verifyWebhook.mockRejectedValue(new Error("invalid signature"));
    const response = await POST(original);

    expect(verifyWebhook).toHaveBeenCalledExactlyOnceWith(original);
    expect(original.bodyUsed).toBe(false);
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_signature");
    expect(getUserBillingSubscription).not.toHaveBeenCalled();
    expect(db.requests).toEqual([]);
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it("applies the shared webhook contract after verification", async () => {
    const { db } = account();
    verifyWebhook.mockResolvedValue({ type: "subscriptionItem.active", data: null });
    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("invalid_input");
    expect(db.requests).toEqual([]);
  });

  it("activates personal Pro and captures one upgrade across concurrent and sequential retries", async () => {
    const { plan } = account();
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("active")));

    await Promise.all([deliver(), deliver()]);
    await deliver();

    expect(getUserBillingSubscription).toHaveBeenCalledWith(ownerId);
    expect(plan()).toBe("pro");
    expect(trackUpgrade).toHaveBeenCalledExactlyOnceWith(ownerId);
  });

  it("initializes a missing account on activation and records the first upgrade", async () => {
    const { plan } = account(null);
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("active")));
    await deliver();

    expect(plan()).toBe("pro");
    expect(trackUpgrade).toHaveBeenCalledExactlyOnceWith(ownerId);
  });

  it("keeps Pro through the paid period and returns to Free after the Pro item ends", async () => {
    const { plan } = account("pro");
    const periodEnd = Date.now() + 86_400_000;
    verifyWebhook.mockResolvedValue(
      webhook("subscriptionItem.canceled", { period_end: periodEnd }),
    );
    getUserBillingSubscription.mockResolvedValue(
      subscription(subscriptionItem("canceled", { periodEnd })),
    );
    await deliver();
    expect(plan()).toBe("pro");

    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.ended"));
    getUserBillingSubscription.mockResolvedValue(
      subscription(subscriptionItem("ended"), subscriptionItem("active", { slug: "free_user" })),
    );
    await deliver();
    expect(plan()).toBe("free");
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it.each([
    webhook("subscriptionItem.active", {}, "starter"),
    webhook("subscriptionItem.ended", {}, "free_user"),
    webhook("subscriptionItem.active", { payer: { user_id: ownerId, organization_id: "org_1" } }),
    webhook("subscriptionItem.active", { payer: { organization_id: "org_1" } }),
    webhook("subscriptionItem.active", { payer: undefined }),
    webhook("subscription.active"),
    webhook("subscriptionItem.upcoming"),
  ])("ignores unrelated deliveries %#", async (event) => {
    const { db } = account();
    verifyWebhook.mockResolvedValue(event);
    await deliver();
    expect(getUserBillingSubscription).not.toHaveBeenCalled();
    expect(db.requests).toEqual([]);
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it("keeps replacement Pro active when a stale end arrives and tracks a real re-upgrade", async () => {
    const { plan } = account();
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("active")));
    await deliver();

    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.ended"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("ended")));
    await deliver();
    expect(plan()).toBe("free");

    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active", { id: "csi_replacement" }));
    getUserBillingSubscription.mockResolvedValue(
      subscription(
        subscriptionItem("ended"),
        subscriptionItem("active", { id: "csi_replacement" }),
      ),
    );
    await deliver();
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.ended"));
    await deliver();

    expect(plan()).toBe("pro");
    expect(trackUpgrade.mock.calls).toEqual([[ownerId], [ownerId]]);
  });

  it("ignores a stale activation when the current Pro item has ended", async () => {
    const { plan } = account();
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("ended")));
    await deliver();

    expect(plan()).toBe("free");
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it("re-reads Clerk when a newer reconciliation preserves the existing Pro plan", async () => {
    const { db, plan } = account("pro");
    const oldLookup = deferred<ReturnType<typeof subscription>>();
    const oldLookupStarted = deferred<undefined>();
    verifyWebhook
      .mockResolvedValueOnce(webhook("subscriptionItem.ended"))
      .mockResolvedValueOnce(webhook("subscriptionItem.active", { id: "csi_replacement" }));
    getUserBillingSubscription
      .mockImplementationOnce(() => {
        oldLookupStarted.resolve(undefined);
        return oldLookup.promise;
      })
      .mockResolvedValue(subscription(subscriptionItem("active", { id: "csi_replacement" })));

    const olderDelivery = deliver();
    await oldLookupStarted.promise;
    await deliver();
    oldLookup.resolve(subscription(subscriptionItem("ended")));
    await olderDelivery;

    expect(getUserBillingSubscription).toHaveBeenCalledTimes(3);
    expect(
      db
        .to(accountsPath, "PATCH")
        .map(({ body, params }) => [params.get("billing_revision"), body]),
    ).toEqual([
      ["eq.0", { plan: "pro", billing_revision: 1 }],
      ["eq.0", { plan: "free", billing_revision: 1 }],
      ["eq.1", { plan: "pro", billing_revision: 2 }],
    ]);
    expect(plan()).toBe("pro");
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it("lets Clerk retry when concurrent changes repeatedly win the account update", async () => {
    const db = fakePostgrest();
    let revision = 0;
    db.on("GET", accountsPath, () => ({ body: [{ plan: "free", billing_revision: revision++ }] }));
    db.on("PATCH", accountsPath, { body: [] });
    vi.stubGlobal("fetch", db.fetchMock);
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("active")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await POST(request())).status).toBe(500);
    expect(getUserBillingSubscription).toHaveBeenCalledTimes(3);
    expect(
      db.to(accountsPath, "PATCH").map(({ params }) => params.get("billing_revision")),
    ).toEqual(["eq.0", "eq.1", "eq.2"]);
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it("requests a retry if Clerk reconciliation fails", async () => {
    const { db } = account("pro");
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.ended"));
    getUserBillingSubscription.mockRejectedValue(new Error("Clerk temporarily unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await POST(request())).status).toBe(500);
    expect(db.to(accountsPath, "PATCH")).toEqual([]);
    expect(trackUpgrade).not.toHaveBeenCalled();
  });

  it("requests a retry after a database write error without tracking an upgrade", async () => {
    const db = fakePostgrest();
    db.on("GET", accountsPath, { body: [{ plan: "free", billing_revision: 0 }] });
    db.on("PATCH", accountsPath, pgError("XX000", "database temporarily unavailable", 500));
    vi.stubGlobal("fetch", db.fetchMock);
    verifyWebhook.mockResolvedValue(webhook("subscriptionItem.active"));
    getUserBillingSubscription.mockResolvedValue(subscription(subscriptionItem("active")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await POST(request())).status).toBe(500);
    expect(trackUpgrade).not.toHaveBeenCalled();
  });
});
