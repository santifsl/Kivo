import { beforeEach, describe, expect, it, vi } from "vitest";

// generateAnswer with the OpenAI client mocked: no network, no key.
vi.mock("server-only", () => ({}));

const create = vi.hoisted(() => vi.fn());
vi.mock("../openai/client", () => ({ createOpenAIClient: () => ({ responses: { create } }) }));

const { CHAT_MODEL, ChatModelError, generateAnswer, MAX_ANSWER_TOKENS } = await import("./answer");
const { buildChatPrompt, I_DONT_KNOW_REPLY } = await import("./prompt");

function answers(output_text: string, status = "completed", reason: string | null = null) {
  create.mockResolvedValue({
    output_text,
    status,
    incomplete_details: reason ? { reason } : null,
    model: "gpt-6-luna-2026-10-01",
    service_tier: "default",
    usage: {
      input_tokens: 123,
      input_tokens_details: { cached_tokens: 40 },
      output_tokens: 23,
    },
  });
}

beforeEach(() => {
  create.mockReset();
});

describe("generateAnswer", () => {
  it("sends the built prompt to CHAT_MODEL with no reasoning, a low temperature and a short cap", async () => {
    answers("  We open at 9.  ");
    const now = vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1125);
    try {
      await expect(generateAnswer("When?", ["We open at 9."])).resolves.toEqual({
        reply: "We open at 9.",
        generation: {
          model: "gpt-6-luna-2026-10-01",
          serviceTier: "default",
          latencySeconds: 0.125,
          usage: { input: 123, cachedInput: 40, output: 23 },
        },
      });
    } finally {
      now.mockRestore();
    }

    const { instructions, input } = buildChatPrompt("When?", ["We open at 9."]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      model: CHAT_MODEL,
      instructions,
      input,
      reasoning: { effort: "none" },
      temperature: 0.2,
      max_output_tokens: MAX_ANSWER_TOKENS,
      store: false,
    });
    expect(MAX_ANSWER_TOKENS).toBeLessThanOrEqual(500);
  });

  it('normalizes the fixed "I don\'t know" text', async () => {
    answers(`“${I_DONT_KNOW_REPLY}”`);
    await expect(generateAnswer("Q", ["P"])).resolves.toMatchObject({ reply: I_DONT_KNOW_REPLY });
  });

  it("no text (cut off at the token cap): throws ChatModelError", async () => {
    answers("", "incomplete", "max_output_tokens");
    const error = await generateAnswer("Q", ["P"]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChatModelError);
    expect((error as Error).message).toContain("max_output_tokens");
  });

  it("an API error propagates", async () => {
    create.mockRejectedValue(new Error("503"));
    await expect(generateAnswer("Q", ["P"])).rejects.toThrow("503");
  });
});
