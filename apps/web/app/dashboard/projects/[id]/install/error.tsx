"use client";

import { ErrorState } from "@/components/ui/error-state";
import { GlassPanel } from "@/components/ui/glass-panel";

export default function InstallError({ retry }: { retry: () => void }) {
  return (
    <GlassPanel as="section">
      <ErrorState
        description="We couldn't load your install code. Please try again."
        onRetry={retry}
      />
    </GlassPanel>
  );
}
