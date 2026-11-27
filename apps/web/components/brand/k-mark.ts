/**
 * The K, drawn on a 32×32 grid: a solid stem, and two arms that stop short of it
 * with an angled cut. Shared by the logo, the app tile, app/icon.svg and the image routes.
 */
export const K_PATHS = [
  // Stem
  "M6 4h6.2v24H6z",
  // Both arms as one shape: the upper arm runs to the top right, the lower arm leaves its
  // inner edge for the baseline, and both stop at a vertical cut 1.4 units off the stem.
  "M13.6 14.56 21 4h7.6l-11.5 16.41 11.15 7.59h-8l-6.65-4.53z",
] as const;

/** Places the K inside a 32×32 rounded tile with optically even padding. */
export const K_TILE_TRANSFORM = "translate(4.44 5.2) scale(0.675)";
export const K_TILE_RADIUS = 7.5;
