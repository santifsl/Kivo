"use client";

import { ErrorState } from "@/components/ui/error-state";
import { GlassPanel } from "@/components/ui/glass-panel";

export default function CustomizeError({ reset }: { reset: () => void }) {
  return (
    <GlassPanel as="section">
      <ErrorState
        description="We couldn't load your widget settings. Please try again."
        onRetry={reset}
      />
    </GlassPanel>
  );
}
