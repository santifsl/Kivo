import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { APP_NAME } from "@kivo/shared";
import { THEME_SCRIPT } from "@/components/theme/theme-script";
import { ThemeSync } from "@/components/theme/theme-sync";
import { PosthogRouteObserver } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
};

// Fonts (project.md §13): Inter for UI and body (`font-sans`), Instrument Serif
// for headlines (`font-display`). globals.css maps the variables to the tokens.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

// No ClerkProvider here: only the dashboard and sign-in/up layouts load Clerk
// (components/auth/app-clerk-provider.tsx), so the widget panel at /embed stays Clerk-free.
//
// THEME_SCRIPT sets the owner's theme class on <html> before first paint, so the
// server's markup differs from the client's there: hence suppressHydrationWarning
// (it applies to <html>'s own attributes only).
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeSync />
        <Suspense fallback={null}>
          <PosthogRouteObserver />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
