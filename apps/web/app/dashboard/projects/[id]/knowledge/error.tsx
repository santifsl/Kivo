"use client";

import { ErrorState } from "@/components/ui/error-state";
import { GlassPanel } from "@/components/ui/glass-panel";

export default function KnowledgeError({ retry }: { retry: () => void }) {
  return (
    <GlassPanel as="section">
      <ErrorState
        description="We couldn't load your knowledge sources. Please try again."
        onRetry={retry}
      />
    </GlassPanel>
  );
}
