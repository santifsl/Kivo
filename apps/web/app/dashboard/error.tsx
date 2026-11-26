"use client";

import { ErrorState } from "@/components/ui/error-state";
import { GlassPanel } from "@/components/ui/glass-panel";

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <GlassPanel as="section">
      <ErrorState description="We couldn't load this page. Please try again." onRetry={retry} />
    </GlassPanel>
  );
}
