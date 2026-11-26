import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@kivo/shared";

// Preview-only route (URK-T01, never merged). Fonts load here, not in the root layout,
// so nothing outside /design-preview changes.
const geist = Geist({ subsets: ["latin"], variable: "--dp-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--dp-geist-mono" });
const inter = Inter({ subsets: ["latin"], variable: "--dp-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--dp-inter-tight" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--dp-serif",
});

export const metadata: Metadata = {
  title: `${APP_NAME} design preview`,
  robots: { index: false, follow: false },
};

export default function DesignPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={[geist, geistMono, inter, interTight, instrumentSerif]
        .map((font) => font.variable)
        .join(" ")}
    >
      {children}
    </div>
  );
}
