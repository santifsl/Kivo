"use client";

import { ErrorState } from "@/components/ui/error-state";
import { Card } from "@/components/ui/card";

export default function ConversationsError({ retry }: { retry: () => void }) {
  return (
    <Card as="section">
      <ErrorState description="We couldn't load conversations. Please try again." onRetry={retry} />
    </Card>
  );
}
