const timestampFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function ConversationTime({ timestamp }: { timestamp: string }) {
  return <time dateTime={timestamp}>{timestampFormat.format(new Date(timestamp))} UTC</time>;
}
