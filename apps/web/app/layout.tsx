import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { APP_NAME } from "@kivo/shared";
import { AFTER_AUTH_PATH, AFTER_SIGN_OUT_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/auth/routes";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClerkProvider
          signInUrl={SIGN_IN_PATH}
          signUpUrl={SIGN_UP_PATH}
          signInFallbackRedirectUrl={AFTER_AUTH_PATH}
          signUpFallbackRedirectUrl={AFTER_AUTH_PATH}
          afterSignOutUrl={AFTER_SIGN_OUT_PATH}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
