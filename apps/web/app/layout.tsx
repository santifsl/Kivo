import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { APP_NAME } from "@kivo/shared";
import { PosthogRouteObserver } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
};

// No ClerkProvider here: only the dashboard and sign-in/up layouts load Clerk
// (components/auth/app-clerk-provider.tsx), so the widget panel at /embed stays Clerk-free.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Suspense fallback={null}>
          <PosthogRouteObserver />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
