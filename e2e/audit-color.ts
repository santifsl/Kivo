// WCAG 2.x contrast math for the redesign audit (pure, unit-tested in audit-color.test.ts).

export type Rgb = [number, number, number];

/** "#RGB" or "#RRGGBB" → [r, g, b] in 0–255. */
export function parseColor(hex: string): Rgb {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA: 4.5:1 for normal text, 3:1 for large text (≥24px, or ≥18.66px bold) and UI parts. */
export function meetsAA(ratio: number, large: boolean): boolean {
  return ratio >= (large ? 3 : 4.5);
}

/** The brand palette pairs the audit reports explicitly (project.md §13). */
export const PALETTE = {
  ink: "#0B0B0C",
  paper: "#F7F7F6",
  white: "#FFFFFF",
  graphite: "#2A2A2D",
  terracotta: "#C96A3F",
} as const;

export function terracottaChecks() {
  const pairs = [
    ["terracotta on ink", PALETTE.terracotta, PALETTE.ink],
    ["terracotta on graphite", PALETTE.terracotta, PALETTE.graphite],
    ["terracotta on paper", PALETTE.terracotta, PALETTE.paper],
    ["terracotta on white", PALETTE.terracotta, PALETTE.white],
  ] as const;
  return pairs.map(([label, fg, bg]) => {
    const ratio = Math.round(contrastRatio(parseColor(fg), parseColor(bg)) * 100) / 100;
    return { label, ratio, normalText: meetsAA(ratio, false), largeText: meetsAA(ratio, true) };
  });
}
