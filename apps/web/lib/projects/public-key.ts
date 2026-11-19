import { randomBytes } from "node:crypto";

/**
 * A new project public key: `pk_` + 32 base64url chars (24 random bytes).
 * It only identifies the project to the widget and grants nothing
 * (docs/project.md §9 "Public key abuse"), but it must be unguessable so
 * keys can't be enumerated. Matches `publicKeySchema` in packages/shared.
 */
export function generatePublicKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}
