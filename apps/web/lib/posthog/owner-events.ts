import "server-only";
import { after } from "next/server";
import { getPosthogServer } from "./server";

type OwnerEvent = ["signed_up"] | ["project_created" | "knowledge_added", projectId: string];

export async function captureOwnerEvent(ownerId: string, ...[event, projectId]: OwnerEvent) {
  try {
    await getPosthogServer()?.captureImmediate({
      distinctId: ownerId,
      event,
      ...(projectId && { properties: { project_id: projectId } }),
    });
  } catch {
    // Analytics delivery is independent of the completed action.
  }
}

export function scheduleOwnerEvent(ownerId: string, ...event: OwnerEvent) {
  try {
    after(() => captureOwnerEvent(ownerId, ...event));
  } catch {
    // An unavailable request lifecycle should not change the result.
  }
}
