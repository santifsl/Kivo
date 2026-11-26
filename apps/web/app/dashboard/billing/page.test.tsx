// @vitest-environment jsdom

import { act, cloneElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BillingPage from "./page";

const { clerk, openCheckout, openSubscription, protect } = vi.hoisted(() => ({
  clerk: { status: "ready", checkoutComplete: false, pricingReady: true },
  openCheckout: vi.fn(),
  openSubscription: vi.fn(),
  protect: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: { protect } }));
vi.mock("@clerk/nextjs", () => ({
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
  expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual([
    "Free",
    "Pro",
  ]);
  await act(async () => button("Subscribe to Pro").click());
  expect(openCheckout).toHaveBeenCalledExactlyOnceWith("user");
});

it("opens Clerk's personal subscription management while billing sync is pending", async () => {
  // The Clerk checkout has completed while the account update can still be pending.
  clerk.checkoutComplete = true;
  await renderBilling();
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
