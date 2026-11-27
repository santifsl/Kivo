const timestampFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** "Nov 19, 2026, 11:30 PM UTC" */
export function formatConversationTime(timestamp: string): string {
  return `${timestampFormat.format(new Date(timestamp))} UTC`;
}

export function ConversationTime({ timestamp }: { timestamp: string }) {
  return <time dateTime={timestamp}>{formatConversationTime(timestamp)}</time>;
}
