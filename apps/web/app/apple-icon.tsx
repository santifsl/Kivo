import { ImageResponse } from "next/og";
import { BRAND_COLORS } from "../components/brand/colors";
import { K_PATHS, K_TILE_TRANSFORM } from "../components/brand/k-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so the tile is a full square.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BRAND_COLORS.ink,
      }}
    >
      <svg width="180" height="180" viewBox="0 0 32 32">
        <g transform={K_TILE_TRANSFORM} fill={BRAND_COLORS.paper}>
          {K_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
    </div>,
    size,
  );
}
