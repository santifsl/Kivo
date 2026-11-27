import { ImageResponse } from "next/og";
import { APP_NAME } from "@kivo/shared";
import { BRAND_COLORS } from "../components/brand/colors";
import { K_PATHS } from "../components/brand/k-mark";

export const alt = `${APP_NAME}: Support that answers from your docs.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LEAD = "Support that answers from ";
const ACCENT = "your docs";

/**
 * Instrument Serif (regular + italic), subset to the characters we draw. ImageResponse
 * can't use system fonts, so if Google Fonts is unreachable at build time the image falls
 * back to its built-in sans rather than failing the build.
 */
async function loadSerif(italic: boolean): Promise<ArrayBuffer | null> {
  const text = encodeURIComponent(`${LEAD}${ACCENT}.`);
  const family = `Instrument+Serif:ital@${italic ? 1 : 0}`;
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${text}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [regular, italic] = await Promise.all([loadSerif(false), loadSerif(true)]);
  const fonts = [
    regular && {
      name: "Instrument Serif",
      data: regular,
      style: "normal" as const,
      weight: 400 as const,
    },
    italic && {
      name: "Instrument Serif",
      data: italic,
      style: "italic" as const,
      weight: 400 as const,
    },
  ].filter((f) => f !== null);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 88,
        background: BRAND_COLORS.ink,
        color: BRAND_COLORS.paper,
      }}
    >
      <svg width="96" height="96" viewBox="0 0 32 32">
        {K_PATHS.map((d) => (
          <path key={d} d={d} fill={BRAND_COLORS.paper} />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          maxWidth: 940,
          fontFamily: "Instrument Serif, Georgia, serif",
          fontSize: 92,
          lineHeight: 1.05,
          letterSpacing: "-0.01em",
        }}
      >
        <span style={{ whiteSpace: "pre-wrap" }}>{LEAD}</span>
        <span style={{ color: BRAND_COLORS.terracotta, fontStyle: "italic" }}>{ACCENT}</span>
        <span>.</span>
      </div>
    </div>,
    { ...size, fonts },
  );
}
