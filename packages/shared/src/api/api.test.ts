import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  clerkWebhookEventSchema,
  createProjectRequestSchema,
  createTextSourceRequestSchema,
  createUploadUrlRequestSchema,
  finalizeUploadRequestSchema,
  idParamsSchema,
  updateProjectRequestSchema,
  updateWidgetConfigRequestSchema,
  widgetConfigQuerySchema,
} from "../index";

const key = "pk_abc123XYZ_789";
const uuid = "3f2b8c1e-4d5a-4b6c-8e7f-9a0b1c2d3e4f";
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("GET /api/widget/config", () => {
  it("accepts a public key and rejects a bad one", () => {
    expect(ok(widgetConfigQuerySchema, { key })).toBe(true);
    expect(ok(widgetConfigQuerySchema, { key: "sk_secret123" })).toBe(false);
    expect(ok(widgetConfigQuerySchema, {})).toBe(false);
  });
});

describe("POST /api/widget/chat", () => {
  const valid = { key, visitorId: "v_1", message: "Hi" };

  it("accepts a valid message, with or without a conversation", () => {
    expect(ok(chatRequestSchema, valid)).toBe(true);
    expect(ok(chatRequestSchema, { ...valid, conversationId: uuid })).toBe(true);
    expect(ok(chatRequestSchema, { ...valid, message: "x".repeat(1000) })).toBe(true);
  });

  it("rejects a 1,001-char message", () => {
    expect(ok(chatRequestSchema, { ...valid, message: "x".repeat(1001) })).toBe(false);
  });

  it("rejects an empty message, bad conversation id or unknown field", () => {
    expect(ok(chatRequestSchema, { ...valid, message: "   " })).toBe(false);
    expect(ok(chatRequestSchema, { ...valid, conversationId: "abc" })).toBe(false);
    expect(ok(chatRequestSchema, { ...valid, plan: "pro" })).toBe(false);
  });
});

describe("projects", () => {
  it("POST /api/projects and PATCH /api/projects/:id accept a name and reject an over-long one", () => {
    for (const schema of [createProjectRequestSchema, updateProjectRequestSchema]) {
      expect(ok(schema, { name: "My site" })).toBe(true);
      expect(ok(schema, { name: "x".repeat(81) })).toBe(false);
      expect(ok(schema, { name: "" })).toBe(false);
    }
  });

  it("PATCH /api/projects/:id rejects fields other than name", () => {
    expect(ok(updateProjectRequestSchema, { name: "a", public_key: key })).toBe(false);
  });

  it("idParamsSchema accepts a uuid and rejects anything else", () => {
    expect(ok(idParamsSchema, { id: uuid })).toBe(true);
    expect(ok(idParamsSchema, { id: "1" })).toBe(false);
  });
});

describe("PATCH /api/projects/:id/config", () => {
  it("accepts a partial config", () => {
    expect(ok(updateWidgetConfigRequestSchema, { button_color: "#112233" })).toBe(true);
  });

  it("rejects a non-hex color, an empty body and unknown fields", () => {
    expect(ok(updateWidgetConfigRequestSchema, { button_color: "blue" })).toBe(false);
    expect(ok(updateWidgetConfigRequestSchema, {})).toBe(false);
    expect(ok(updateWidgetConfigRequestSchema, { plan: "pro" })).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge", () => {
  it("accepts 50,000 chars and rejects a 50,001-char text source", () => {
    expect(ok(createTextSourceRequestSchema, { title: "FAQ", content: "x".repeat(50_000) })).toBe(
      true,
    );
    expect(ok(createTextSourceRequestSchema, { title: "FAQ", content: "x".repeat(50_001) })).toBe(
      false,
    );
  });

  it("rejects a missing title", () => {
    expect(ok(createTextSourceRequestSchema, { title: "", content: "x" })).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  const valid = {
    title: "Guide",
    fileName: "guide.pdf",
    fileSize: 1024,
    contentType: "application/pdf",
  };

  it("accepts each allowed file type up to 10 MB", () => {
    expect(ok(createUploadUrlRequestSchema, valid)).toBe(true);
    expect(ok(createUploadUrlRequestSchema, { ...valid, fileSize: 10 * 1024 * 1024 })).toBe(true);
    expect(
      ok(createUploadUrlRequestSchema, {
        ...valid,
        fileName: "a.md",
        contentType: "text/markdown",
      }),
    ).toBe(true);
    expect(
      ok(createUploadUrlRequestSchema, { ...valid, fileName: "a.txt", contentType: "text/plain" }),
    ).toBe(true);
  });

  it("rejects a file over 10 MB or empty", () => {
    expect(ok(createUploadUrlRequestSchema, { ...valid, fileSize: 10 * 1024 * 1024 + 1 })).toBe(
      false,
    );
    expect(ok(createUploadUrlRequestSchema, { ...valid, fileSize: 0 })).toBe(false);
  });

  it("rejects other types and a mismatched extension", () => {
    expect(ok(createUploadUrlRequestSchema, { ...valid, fileName: "a.exe" })).toBe(false);
    expect(ok(createUploadUrlRequestSchema, { ...valid, contentType: "text/html" })).toBe(false);
    expect(ok(createUploadUrlRequestSchema, { ...valid, fileName: "a.txt" })).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("accepts a source id and rejects a bad one", () => {
    expect(ok(finalizeUploadRequestSchema, { sourceId: uuid })).toBe(true);
    expect(ok(finalizeUploadRequestSchema, { sourceId: "x" })).toBe(false);
  });
});

describe("POST /api/clerk/webhook", () => {
  it("accepts a Clerk event and keeps extra fields", () => {
    const event = { type: "subscriptionItem.active", data: { id: "si_1" }, object: "event" };
    expect(clerkWebhookEventSchema.parse(event)).toEqual(event);
  });

  it("rejects a body without type or data", () => {
    expect(ok(clerkWebhookEventSchema, { data: {} })).toBe(false);
    expect(ok(clerkWebhookEventSchema, { type: "user.created" })).toBe(false);
  });
});
