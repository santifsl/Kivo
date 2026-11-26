export const DIRECTIONS = [
  {
    id: "ink",
    tab: "A · Ink",
    summary:
      "Precise, technical. Geist everywhere, Geist Mono for labels and numbers, hairline borders, 10px radius, square-ish buttons, faint grid on the dark landing.",
  },
  {
    id: "glass",
    tab: "B · Graphite glass",
    summary:
      "Premium, soft. Inter Tight and Inter, frosted panels, a white spotlight glow, pill buttons, and a silver gradient on one phrase and the logo mark.",
  },
  {
    id: "editorial",
    tab: "C · Editorial",
    summary:
      "Refined, confident. Inter Tight and Inter, Instrument Serif italic for a few key words and the wordmark, film grain on the dark landing, 14px radius, pill buttons.",
  },
  {
    id: "cb",
    tab: "C+B",
    summary:
      "C's type, wordmark and grain with B's frosted panels, spotlight glow and pill buttons. No silver: the serif italic is the accent.",
  },
] as const;

export type DirectionId = (typeof DIRECTIONS)[number]["id"];

export function directionFrom(value: string | string[] | undefined): DirectionId {
  const id = Array.isArray(value) ? value[0] : value;
  return DIRECTIONS.find((direction) => direction.id === id)?.id ?? "cb";
}

/** Editorial directions use the lowercase serif wordmark. */
export function isEditorial(direction: DirectionId): boolean {
  return direction === "editorial" || direction === "cb";
}
