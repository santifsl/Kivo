export interface RecentConversation {
  id: string;
  created_at: string;
  /** First visitor message, shortened. Empty when there is none yet. */
  preview: string;
}

export interface OverviewData {
  conversationCount: number;
  sourceCount: number;
  readySourceCount: number;
  /** Newest first, at most 5. */
  recent: RecentConversation[];
}

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "5 minutes ago", "yesterday", "just now". Rendered on the server only. */
export function formatRelativeTime(timestamp: string, now: Date = new Date()): string {
  const then = Date.parse(timestamp);
  if (Number.isNaN(then)) return timestamp;
  const seconds = Math.round((then - now.getTime()) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.trunc(seconds / size), unit);
  }
  return "just now";
}
