import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassPanel } from "@/components/ui/glass-panel";

// Unknown, malformed or another owner's project id: all look the same.
export default function ProjectNotFound() {
  return (
    <GlassPanel as="section">
      <EmptyState
        title="Project not found"
        description="It doesn't exist, or it isn't yours."
        action={
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-md border border-line bg-wash px-4 text-sm font-medium text-ink hover:bg-wash-strong"
          >
            Back to projects
          </Link>
        }
      />
    </GlassPanel>
  );
}
