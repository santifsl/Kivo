import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import {
  AFTER_AUTH_PATH,
  AFTER_SIGN_OUT_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "@/lib/auth/routes";

/**
 * Clerk for the pages that use it: the dashboard, sign-in and sign-up layouts.
 *
 * Not in the root layout on purpose: the widget panel (/embed) and the landing page don't
 * use Clerk, and Clerk's script and dev handshake inside the customer's cross-origin iframe
 * depend on third-party cookies.
 */
export function AppClerkProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ClerkProvider
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl={AFTER_AUTH_PATH}
      signUpFallbackRedirectUrl={AFTER_AUTH_PATH}
      afterSignOutUrl={AFTER_SIGN_OUT_PATH}
    >
      {children}
    </ClerkProvider>
  );
}
