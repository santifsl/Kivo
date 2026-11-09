/**
 * Returns `value`, or throws naming the missing variable. Never includes the
 * value in the message. Callers pass `process.env.NAME` statically so Next.js
 * can inline `NEXT_PUBLIC_*` values.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Set it in the app's environment.`);
  }
  return value;
}
