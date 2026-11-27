import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@kivo/shared";
import SignInPage from "../../app/sign-in/[[...sign-in]]/page";
import SignUpPage from "../../app/sign-up/[[...sign-up]]/page";
import { AUTH_BENEFITS, AUTH_COPY, CLERK_ELEMENTS, withAuthElements } from "./auth-layout";

vi.mock("next/font/google", () => ({ Inter: () => ({ className: "font-inter" }) }));
vi.mock("@clerk/nextjs", () => ({
  ClerkLoading: () => null,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  SignIn: () => <div data-clerk="sign-in" />,
  SignUp: () => <div data-clerk="sign-up" />,
}));

describe.each([
  ["sign-in", SignInPage],
  ["sign-up", SignUpPage],
] as const)("%s page", (mode, Page) => {
  const html = renderToStaticMarkup(<Page />);

  it("has the brand panel: logo, serif line, benefits, hero art", () => {
    expect(html).toContain(`aria-label="About ${APP_NAME}"`);
    expect(html).toMatch(/<aside[^>]*class="theme-dark /);
    expect(html).toContain(AUTH_COPY[mode].line);
    for (const b of AUTH_BENEFITS) expect(html).toContain(b.label);
  });

  it("has a Back link to the landing and our own title", () => {
    expect(html).toMatch(new RegExp(`<a[^>]*href="/"[^>]*>.*?Back to ${APP_NAME}</a>`));
    expect(html).toContain(`<h1 class="font-display`);
    expect(html).toContain(AUTH_COPY[mode].title);
  });

  it("puts the logo above the form on narrow screens only", () => {
    expect(html).toMatch(/data-testid="auth-mobile-logo" class="lg:hidden"/);
  });

  it("waits for resolved colors before rendering Clerk (no unthemed flash on the server)", () => {
    expect(html).toContain('role="status"');
    expect(html).not.toContain("data-clerk=");
  });
});

describe("withAuthElements", () => {
  const base = { variables: { colorPrimary: "#0b0b0c" } };

  it("hides Clerk's header and logo and makes buttons pills", () => {
    const out = withAuthElements(base, "#c96a3f");
    expect(out.elements).toBe(CLERK_ELEMENTS);
    expect(out.elements.header).toEqual({ display: "none" });
    expect(out.elements.logoBox).toEqual({ display: "none" });
    expect(out.elements.formButtonPrimary).toEqual({ borderRadius: "9999px" });
  });

  it("uses the terracotta token as the focus ring when it resolved", () => {
    expect(withAuthElements(base, "#c96a3f").variables).toEqual({
      colorPrimary: "#0b0b0c",
      colorRing: "#c96a3f",
    });
  });

  it.each(["", "var(--color-terracotta)"])(
    "leaves colorRing to Clerk when the token is %j",
    (brand) => {
      expect(withAuthElements(base, brand).variables).toEqual({ colorPrimary: "#0b0b0c" });
    },
  );
});
