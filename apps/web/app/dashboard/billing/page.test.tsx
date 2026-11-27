// @vitest-environment jsdom

import { act, cloneElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BillingPage from "./page";

const { clerk, openCheckout, openSubscription, protect, owner } = vi.hoisted(() => ({
  owner: { plan: "free" as "free" | "pro" | null },
  clerk: { status: "ready", checkoutComplete: false, pricingReady: true, pro: false },
  openCheckout: vi.fn(),
  openSubscription: vi.fn(),
  protect: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("../../../lib/accounts/get-owner-plan", () => ({ getOwnerPlan: async () => owner.plan }));
vi.mock("@clerk/nextjs", () => ({
  // Clerk's view of the plan (session claims). Only picks the card's button.
  useAuth: () => ({ has: ({ plan }: { plan: string }) => plan === "pro" && clerk.pro }),
  ClerkFailed: ({ children }: { children: ReactNode }) =>
    clerk.status === "failed" ? children : null,
  ClerkLoaded: ({ children }: { children: ReactNode }) =>
    clerk.status === "ready" ? children : null,
  ClerkLoading: ({ children }: { children: ReactNode }) =>
    clerk.status === "loading" ? children : null,
  Show: ({ children, when }: { children: ReactNode; when: string }) =>
    when === "signed-in" && clerk.status === "ready" ? children : null,
  PricingTable: ({ for: payer, fallback }: { for: string; fallback: ReactNode }) =>
    clerk.pricingReady ? (
      <div data-fixture-pricing-for={payer}>
        <h2>Free</h2>
        <h2>Pro</h2>
        {clerk.checkoutComplete ? (
          <span>Current plan</span>
        ) : (
          <button onClick={() => openCheckout(payer)}>Subscribe to Pro</button>
        )}
      </div>
    ) : (
      fallback
    ),
}));
vi.mock("@clerk/nextjs/experimental", () => ({
  SubscriptionDetailsButton: ({
    children,
    for: payer,
  }: {
    children: ReactElement<{ onClick: () => void }>;
    for: string;
  }) => cloneElement(children, { onClick: () => openSubscription(payer) }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  clerk.status = "ready";
  clerk.checkoutComplete = false;
  clerk.pricingReady = true;
  clerk.pro = false;
  owner.plan = "free";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderBilling() {
  const page = await BillingPage();
  await act(async () => root.render(page));
}

function button(label: string) {
  const match = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

it("protects the route and uses Clerk's personal plans and checkout", async () => {
  await renderBilling();
  expect(protect).toHaveBeenCalledOnce();
  expect(container.querySelector("h1")?.textContent).toBe("Billing");
  expect(
    container.querySelector("[data-fixture-pricing-for]")?.getAttribute("data-fixture-pricing-for"),
  ).toBe("user");
  const plans = container.querySelector('[aria-label="Subscription plans"]');
  expect([...(plans?.querySelectorAll("h2") ?? [])].map((heading) => heading.textContent)).toEqual([
    "Free",
    "Pro",
  ]);
  await act(async () => button("Subscribe to Pro").click());
  expect(openCheckout).toHaveBeenCalledExactlyOnceWith("user");
});

it("opens Clerk's personal subscription management while billing sync is pending", async () => {
  // The Clerk checkout has completed while the account update can still be pending:
  // our row still says Free, Clerk's session already has Pro.
  clerk.checkoutComplete = true;
  clerk.pro = true;
  await renderBilling();
  const card = container.querySelector('[aria-labelledby="current-plan-heading"]');
  expect(card?.querySelector("h2")?.textContent).toBe("Free plan");
  expect(card?.querySelector('a[href="#plans"]')).toBeNull();
  expect(container.textContent).toContain("Current plan");
  await act(async () => button("Manage subscription").click());
  expect(openSubscription).toHaveBeenCalledExactlyOnceWith("user");
});

it("shows the loading fallback until Clerk's plans are ready", async () => {
  clerk.pricingReady = false;
  await renderBilling();
  expect(container.querySelector("[role=status]")?.textContent).toContain(
    "Loading subscription plans",
  );
});

it("shows the dashboard error state when Clerk fails to load", async () => {
  clerk.status = "failed";
  await renderBilling();
  expect(container.querySelector("[role=alert]")?.textContent).toContain("Billing is unavailable");
  expect(container.textContent).not.toContain("Manage subscription");
});

it("shows the Free card with what's included and Upgrade to Pro, not Manage subscription", async () => {
  await renderBilling();
  const card = container.querySelector('[aria-labelledby="current-plan-heading"]');
  expect(card?.querySelector("h2")?.textContent).toBe("Free plan");
  expect(card?.textContent).toContain("$0");
  expect(card?.textContent).toContain("1 project");
  expect(card?.textContent).toContain("100 messages per project each month");
  expect(card?.textContent).toContain("3 knowledge sources per project");
  expect(card?.textContent).toContain("The default widget look");
  // Free has no subscription to manage: the card links to the plans table instead.
  const upgrade = card?.querySelector<HTMLAnchorElement>('a[href="#plans"]');
  expect(upgrade?.textContent).toBe("Upgrade to Pro");
  expect(container.querySelector("#plans")?.getAttribute("aria-label")).toBe("Subscription plans");
  expect(container.textContent).not.toContain("Manage subscription");
});

it("describes Pro from the shared limits", async () => {
  owner.plan = "pro";
  await renderBilling();
  const card = container.querySelector('[aria-labelledby="current-plan-heading"]');
  expect(card?.querySelector("h2")?.textContent).toBe("Pro plan");
  expect(card?.textContent).toContain("$9 / month");
  expect(card?.textContent).toContain("5 projects");
  expect(card?.textContent).toContain("2,000 messages per project each month");
  expect(card?.textContent).toContain("Full widget customization");
  // Pro keeps Clerk's subscription management, exactly once, in the card.
  const manage = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Manage subscription");
  expect(manage).toHaveLength(1);
  expect(card?.contains(manage[0] ?? null)).toBe(true);
  expect(card?.querySelector('a[href="#plans"]')).toBeNull();
});

it("still renders when the plan can't be read", async () => {
  owner.plan = null;
  await renderBilling();
  expect(container.textContent).toContain("Plan unavailable");
  expect(container.querySelector('[aria-label="Subscription plans"]')).not.toBeNull();
});
