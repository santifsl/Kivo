import "server-only";
import arcjet, { detectPromptInjection, fixedWindow, type ArcjetDecision } from "@arcjet/next";

/**
 * Arcjet protection for the public widget routes (docs/project.md §3, §6.6
 * step 1, §9 "Cost abuse", "Prompt injection").
 *
 * This is the only file that reads ARCJET_KEY (a test enforces it).
 *
 * Fail open: a missing key, an Arcjet error or a timeout (the SDK's default is
 * 2 s) lets the request through and logs one line. The quota (consume_message)
 * and the message length limit still apply, so an Arcjet outage never takes
 * the widget down. Logs never contain the visitor's message or the key.
 */

export type ProtectResult =
  { allowed: true } | { allowed: false; reason: "rate_limit" | "injection" };

/** Per public key + client IP, fixed window. */
export const CHAT_RATE_LIMIT = { max: 20, window: "60s" } as const;
/** Every page load with the widget calls the config route once. */
export const CONFIG_RATE_LIMIT = { max: 60, window: "60s" } as const;

// `publicKey` is a custom characteristic, passed to protect(); `ip.src` is the
// client IP the SDK detects (on Vercel, from x-vercel-forwarded-for).
const CHARACTERISTICS = ["publicKey", "ip.src"] as const;

function createClients(key: string) {
  const aj = arcjet({ key, rules: [] });
  return {
    config: aj.withRule(
      fixedWindow({ mode: "LIVE", characteristics: CHARACTERISTICS, ...CONFIG_RATE_LIMIT }),
    ),
    chat: aj
      .withRule(fixedWindow({ mode: "LIVE", characteristics: CHARACTERISTICS, ...CHAT_RATE_LIMIT }))
      .withRule(detectPromptInjection({ mode: "LIVE" })),
  };
}

type Clients = ReturnType<typeof createClients>;
let clients: Clients | null = null;

/** The shared clients, or null when ARCJET_KEY isn't set. */
function getClients(): Clients | null {
  const key = process.env.ARCJET_KEY?.trim();
  if (!key) return null;
  clients ??= createClients(key);
  return clients;
}

type Route = "chat" | "config";

function failOpen(route: Route, why: string): ProtectResult {
  console.warn(`[arcjet] ${route}: allowed without protection (${why})`);
  return { allowed: true };
}

function toResult(route: Route, decision: ArcjetDecision): ProtectResult {
  if (decision.isErrored()) return failOpen(route, "arcjet error");
  if (!decision.isDenied()) return { allowed: true };
  // Only two rules can deny: the rate limit and (chat) prompt injection.
  return {
    allowed: false,
    reason: decision.reason.isPromptInjection() ? "injection" : "rate_limit",
  };
}

async function run(route: Route, protect: () => Promise<ArcjetDecision>): Promise<ProtectResult> {
  try {
    return toResult(route, await protect());
  } catch (error) {
    // The SDK shouldn't throw, but if it does, the error's name is enough:
    // its message could echo request data.
    return failOpen(route, `threw ${error instanceof Error ? error.name : typeof error}`);
  }
}

/**
 * POST /api/widget/chat: 20 messages per 60 s per public key + IP, and prompt
 * injection detection on `message`. Call once per request, before any
 * counting or OpenAI call.
 */
export function protectChat(
  request: Request,
  { publicKey, message }: { publicKey: string; message: string },
): Promise<ProtectResult> {
  const c = getClients();
  if (!c) return Promise.resolve(failOpen("chat", "ARCJET_KEY not set"));
  return run("chat", () =>
    c.chat.protect(request, { publicKey, detectPromptInjectionMessage: message }),
  );
}

/** GET /api/widget/config: 60 requests per 60 s per public key + IP. */
export function protectConfig(
  request: Request,
  { publicKey }: { publicKey: string },
): Promise<ProtectResult> {
  const c = getClients();
  if (!c) return Promise.resolve(failOpen("config", "ARCJET_KEY not set"));
  return run("config", () => c.config.protect(request, { publicKey }));
}
