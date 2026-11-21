import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { PostHog } from "posthog-node";
import type { ProtectResult } from "../arcjet/protect";
import { CHAT_MODEL, type ChatGeneration } from "../chat/answer";
import { getPosthogServer } from "./server";

function afterResponse(capture: (posthog: PostHog) => Promise<unknown>): void {
  try {
    const posthog = getPosthogServer();
    if (!posthog) return;
    after(async () => {
      try {
        await capture(posthog);
      } catch {
        // The established chat result is independent of analytics delivery.
      }
    });
  } catch {
    // Analytics also stays optional if the client or lifecycle is unavailable.
  }
}

export function trackBlockedMessage(reason: Extract<ProtectResult, { allowed: false }>["reason"]) {
  // The SDK assigns a personless ID. The reason is the only application property.
  afterResponse((posthog) =>
    posthog.captureImmediate({
      event: "message_blocked",
      properties: { reason },
    }),
  );
}

export function trackFirstChat(ownerId: string, projectId: string, firstChatAt: string): void {
  afterResponse((posthog) =>
    posthog.captureImmediate({
      distinctId: ownerId,
      event: "first_chat",
      uuid: projectId,
      timestamp: new Date(firstChatAt),
      properties: { project_id: projectId },
    }),
  );
}

// Public USD per million tokens for online GPT-6 Luna requests.
// https://developers.openai.com/api/docs/pricing
function tokenRates(model: string, serviceTier: string | null | undefined) {
  if (model !== CHAT_MODEL && !model.startsWith(`${CHAT_MODEL}-`)) return;
  switch (serviceTier) {
    case "flex":
      return { input: 0.05, cachedInput: 0.005, output: 0.25 };
    case "priority":
      return { input: 0.2, cachedInput: 0.02, output: 1 };
    case "auto":
    case "default":
    case undefined:
    case null:
      return { input: 0.1, cachedInput: 0.01, output: 0.5 };
  }
}

function generationUsage(generation: ChatGeneration) {
  const { usage } = generation;
  if (!usage) return {};

  const rates = tokenRates(generation.model, generation.serviceTier);
  const inputCost = rates
    ? ((usage.input - usage.cachedInput) * rates.input + usage.cachedInput * rates.cachedInput) /
      1_000_000
    : undefined;
  const outputCost = rates ? (usage.output * rates.output) / 1_000_000 : undefined;

  return {
    $ai_input_tokens: usage.input,
    $ai_cache_read_input_tokens: usage.cachedInput,
    $ai_output_tokens: usage.output,
    ...(inputCost !== undefined &&
      outputCost !== undefined && {
        $ai_input_cost_usd: inputCost,
        $ai_output_cost_usd: outputCost,
        $ai_total_cost_usd: inputCost + outputCost,
      }),
  };
}

export function trackChatGeneration(
  ownerId: string,
  projectId: string,
  conversationId: string,
  generation: ChatGeneration,
): void {
  afterResponse((posthog) =>
    posthog.captureAiImmediate({
      distinctId: ownerId,
      event: "$ai_generation",
      properties: {
        project_id: projectId,
        $ai_trace_id: randomUUID(),
        $ai_session_id: conversationId,
        $ai_model: generation.model,
        $ai_provider: "openai",
        $ai_latency: generation.latencySeconds,
        ...generationUsage(generation),
      },
    }),
  );
}
