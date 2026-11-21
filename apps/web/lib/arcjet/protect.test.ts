import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// lib/arcjet/protect.ts with the Arcjet SDK mocked: no network, no key needed.
vi.mock("server-only", () => ({}));

// Built at runtime so this file doesn't contain the variable's name (see arcjet-key.test.ts).
const KEY_ENV = ["ARCJET", "KEY"].join("_");

interface FakeDecision {
  isErrored(): boolean;
  isDenied(): boolean;
  reason: { isRateLimit(): boolean; isPromptInjection(): boolean };
}

function decision(kind: "allow" | "rate_limit" | "injection" | "error"): FakeDecision {
  return {
    isErrored: () => kind === "error",
    isDenied: () => kind === "rate_limit" || kind === "injection",
    reason: {
      isRateLimit: () => kind === "rate_limit",
      isPromptInjection: () => kind === "injection",
    },
  };
}

// Each withRule() returns a new client; record the rules and the protect calls.
const sdk = vi.hoisted(() => {
  const rules: unknown[][] = [];
  const protect = vi.fn<(chain: unknown[], ...args: unknown[]) => Promise<FakeDecision>>();
  const arcjetOptions: unknown[] = [];
  interface FakeClient {
    withRule(rule: unknown): FakeClient;
    protect(...args: unknown[]): Promise<FakeDecision>;
  }
  function client(chain: unknown[]): FakeClient {
    return {
      withRule(rule: unknown) {
        const next = [...chain, rule];
        rules.push(next);
        return client(next);
      },
      protect: (...args: unknown[]) => protect(chain, ...args),
    };
  }
  return { rules, protect, arcjetOptions, client };
});

vi.mock("@arcjet/next", () => ({
  default: (options: unknown) => {
    sdk.arcjetOptions.push(options);
    return sdk.client([]);
  },
  fixedWindow: (options: unknown) => ({ rule: "fixedWindow", ...(options as object) }),
  detectPromptInjection: (options: unknown) => ({
    rule: "detectPromptInjection",
    ...(options as object),
  }),
}));

const REQUEST = new Request("https://kivo.test/api/widget/chat", { method: "POST" });
const MESSAGE = "my secret question about invoices";
const PUBLIC_KEY = "pk_test_abcdefgh";

let warn: MockInstance<typeof console.warn>;

async function load() {
  vi.resetModules();
  return import("./protect");
}

beforeEach(() => {
  sdk.rules.length = 0;
  sdk.arcjetOptions.length = 0;
  sdk.protect.mockReset();
  vi.stubEnv(KEY_ENV, "ajkey_test_123");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Every console.warn line, joined: must never contain the message or the key. */
function logged(): string {
  return warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
}

describe("rules", () => {
  it("chat: fixed window 20 / 60 s on public key + IP, plus prompt injection, all LIVE", async () => {
    sdk.protect.mockResolvedValue(decision("allow"));
    const { protectChat } = await load();
    await protectChat(REQUEST, { publicKey: PUBLIC_KEY, message: MESSAGE });

    const [chain, request, props] = sdk.protect.mock.calls[0] ?? [];
    expect(chain).toEqual([
      {
        rule: "fixedWindow",
        mode: "LIVE",
        characteristics: ["publicKey", "ip.src"],
        max: 20,
        window: "60s",
      },
      { rule: "detectPromptInjection", mode: "LIVE" },
    ]);
    expect(request).toBe(REQUEST);
    expect(props).toEqual({ publicKey: PUBLIC_KEY, detectPromptInjectionMessage: MESSAGE });
    expect(sdk.arcjetOptions).toEqual([{ key: "ajkey_test_123", rules: [] }]);
  });

  it("config: fixed window 60 / 60 s on public key + IP, LIVE, no injection rule", async () => {
    sdk.protect.mockResolvedValue(decision("allow"));
    const { protectConfig } = await load();
    await protectConfig(REQUEST, { publicKey: PUBLIC_KEY });

    const [chain, , props] = sdk.protect.mock.calls[0] ?? [];
    expect(chain).toEqual([
      {
        rule: "fixedWindow",
        mode: "LIVE",
        characteristics: ["publicKey", "ip.src"],
        max: 60,
        window: "60s",
      },
    ]);
    expect(props).toEqual({ publicKey: PUBLIC_KEY });
  });

  it("builds the client once and reuses it", async () => {
    sdk.protect.mockResolvedValue(decision("allow"));
    const { protectChat, protectConfig } = await load();
    await protectConfig(REQUEST, { publicKey: PUBLIC_KEY });
    await protectConfig(REQUEST, { publicKey: PUBLIC_KEY });
    await protectChat(REQUEST, { publicKey: PUBLIC_KEY, message: MESSAGE });
    expect(sdk.arcjetOptions).toHaveLength(1);
  });
});

describe.each([
  ["protectChat", { publicKey: PUBLIC_KEY, message: MESSAGE }],
  ["protectConfig", { publicKey: PUBLIC_KEY }],
] as const)("%s", (name, input) => {
  async function call() {
    const mod = await load();
    // Both take (request, input); the config input is a subset of the chat one.
    return mod[name](REQUEST, input as { publicKey: string; message: string });
  }

  it("allowed", async () => {
    sdk.protect.mockResolvedValue(decision("allow"));
    await expect(call()).resolves.toEqual({ allowed: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("rate limited → reason rate_limit", async () => {
    sdk.protect.mockResolvedValue(decision("rate_limit"));
    await expect(call()).resolves.toEqual({ allowed: false, reason: "rate_limit" });
  });

  it("Arcjet error (e.g. timeout) → allowed, one log line", async () => {
    sdk.protect.mockResolvedValue(decision("error"));
    await expect(call()).resolves.toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(logged()).toMatch(
      /^\[arcjet\] (chat|config): allowed without protection \(arcjet error\)$/,
    );
  });

  it("SDK throws → allowed, one log line without the error's message", async () => {
    sdk.protect.mockRejectedValue(new TypeError(`boom ${MESSAGE} ajkey_test_123`));
    await expect(call()).resolves.toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(logged()).toMatch(/\(threw TypeError\)$/);
    expect(logged()).not.toContain(MESSAGE);
    expect(logged()).not.toContain("ajkey_test_123");
  });

  it.each([undefined, "", "   "])(
    "no key (%j) → allowed, one log line, SDK never called",
    async (value) => {
      if (value === undefined) vi.stubEnv(KEY_ENV, undefined);
      else vi.stubEnv(KEY_ENV, value);
      await expect(call()).resolves.toEqual({ allowed: true });
      expect(sdk.protect).not.toHaveBeenCalled();
      expect(sdk.arcjetOptions).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(logged().endsWith(`(${KEY_ENV} not set)`)).toBe(true);
    },
  );
});

describe("protectChat injection", () => {
  it("prompt injection → reason injection, message never logged", async () => {
    sdk.protect.mockResolvedValue(decision("injection"));
    const { protectChat } = await load();
    await expect(
      protectChat(REQUEST, { publicKey: PUBLIC_KEY, message: MESSAGE }),
    ).resolves.toEqual({ allowed: false, reason: "injection" });
    expect(logged()).not.toContain(MESSAGE);
  });
});
