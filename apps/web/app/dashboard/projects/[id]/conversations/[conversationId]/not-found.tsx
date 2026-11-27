import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";

export default function ConversationNotFound() {
  return (
    <Card as="section">
      <EmptyState title="Conversation not found" />
    </Card>
  );
}
