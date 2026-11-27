import { Inter } from "next/font/google";
import { APP_NAME } from "@kivo/shared";
import styles from "./brand.module.css";

// The wordmark is Inter semibold. Loaded here so the logo looks right on every page,
// whatever fonts the page's layout loads.
const inter = Inter({ subsets: ["latin"], weight: "600", display: "swap" });

export type BrandTone = "ink" | "paper";

/**
 * The K, drawn on a 32×32 grid: a solid stem, and two arms that stop short of it
 * with an angled cut. Shared by the mark, the app tile and app/icon.svg.
 */
export const K_PATHS = [
  // Stem
  "M6 4h6.2v24H6z",
  // Both arms as one shape: the upper arm runs to the top right, the lower arm leaves its
  // inner edge for the baseline, and both stop at a vertical cut 1.4 units off the stem.
  "M13.6 14.56 21 4h7.6l-11.5 16.41 11.15 7.59h-8l-6.65-4.53z",
] as const;

const TONE_CLASS: Record<BrandTone, string> = {
  ink: styles.toneInk,
  paper: styles.tonePaper,
};

type MarkProps = {
  /** Width and height in px. */
  size?: number;
  /** ink: dark K for light backgrounds. paper: light K for dark backgrounds. */
  tone?: BrandTone;
  className?: string;
  /** Hide from assistive tech when a parent already names the logo. */
  decorative?: boolean;
};

function a11y(decorative: boolean | undefined) {
  return decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": APP_NAME } as const);
}

/** The K alone. */
export function KivoMark({ size = 28, tone = "ink", className, decorative }: MarkProps) {
  return (
    <svg
      {...a11y(decorative)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={[styles.mark, TONE_CLASS[tone], className].filter(Boolean).join(" ")}
      data-tone={tone}
    >
      {K_PATHS.map((d) => (
        <path key={d} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * The app mark: a K on a rounded-square tile.
 * tone ink = ink tile with a paper K; tone paper = paper tile with an ink K.
 */
export function KivoAppMark({ size = 32, tone = "ink", className, decorative }: MarkProps) {
  const tile = tone === "ink" ? styles.tileInk : styles.tilePaper;
  const glyph = tone === "ink" ? styles.glyphPaper : styles.glyphInk;
  return (
    <svg
      {...a11y(decorative)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={[styles.mark, className].filter(Boolean).join(" ")}
      data-tone={tone}
    >
      <rect width="32" height="32" rx="7.5" className={tile} />
      {/* Scale the K into the tile with even padding. */}
      <g transform="translate(4.44 5.2) scale(0.675)" className={glyph}>
        {K_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

type LogoProps = Omit<MarkProps, "decorative"> & {
  /** Mark style: the bare K, or the K on its app tile. */
  variant?: "mark" | "app-mark";
};

/** Mark + wordmark. The whole lockup has one accessible name. */
export function KivoLogo({ size = 28, tone = "ink", variant = "mark", className }: LogoProps) {
  const Mark = variant === "app-mark" ? KivoAppMark : KivoMark;
  return (
    <span
      role="img"
      aria-label={APP_NAME}
      className={[styles.logo, TONE_CLASS[tone], className].filter(Boolean).join(" ")}
      style={{ fontSize: Math.round(size * 0.72) }}
      data-tone={tone}
    >
      <Mark size={size} tone={tone} decorative />
      <span aria-hidden="true" className={`${styles.wordmark} ${inter.className}`}>
        {APP_NAME}
      </span>
    </span>
  );
}
