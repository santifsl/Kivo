import { EmptyState } from "@/components/ui/empty-state";
import { GlassPanel } from "@/components/ui/glass-panel";

export default function ConversationNotFound() {
  return (
    <GlassPanel as="section">
      <EmptyState title="Conversation not found" />
    </GlassPanel>
  );
}
