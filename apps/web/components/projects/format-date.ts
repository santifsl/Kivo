// UTC, so the server render and the browser agree (no hydration mismatch).
const PROJECT_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** "Nov 19, 2026" from an ISO timestamp; the raw value if it doesn't parse. */
export function formatProjectDate(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : PROJECT_DATE.format(date);
}
