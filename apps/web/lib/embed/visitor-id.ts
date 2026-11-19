import { VISITOR_ID_MAX_LENGTH } from "@kivo/shared";
import { randomId } from "./random-id";

/** localStorage key, in the iframe's (our) origin. */
export const VISITOR_ID_STORAGE_KEY = "embed.visitorId";

// Used when storage is blocked or partitioned away: stable for this page's lifetime.
let memoryId: string | null = null;

function isValid(id: string | null): id is string {
  return !!id && id.length <= VISITOR_ID_MAX_LENGTH && id.trim() === id;
}

/**
 * The visitor's random ID, reused across visits through `localStorage`.
 * If storage throws (blocked third-party storage, privacy modes), falls back
 * to an in-memory ID. `getStorage` is injectable for tests.
 */
export function getVisitorId(getStorage: () => Storage = () => window.localStorage): string {
  try {
    const storage = getStorage();
    const stored = storage.getItem(VISITOR_ID_STORAGE_KEY);
    if (isValid(stored)) return stored;
    const id = randomId();
    storage.setItem(VISITOR_ID_STORAGE_KEY, id);
    return id;
  } catch {
    memoryId ??= randomId();
    return memoryId;
  }
}

/** Test helper: forget the in-memory fallback. */
export function resetVisitorIdMemory(): void {
  memoryId = null;
}
