import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_TEXT_SOURCE_LENGTH,
  fileTypeFromName,
} from "./index";

describe("input limits", () => {
  it("are the product owner's values", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(1000);
    expect(MAX_TEXT_SOURCE_LENGTH).toBe(50_000);
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(MAX_FILE_BYTES);
  });
});

describe("fileTypeFromName", () => {
  it("reads allowed extensions, any case", () => {
    expect(fileTypeFromName("guide.PDF")).toBe("pdf");
    expect(fileTypeFromName("notes.md")).toBe("md");
    expect(fileTypeFromName("a.b.txt")).toBe("txt");
  });

  it("rejects other or missing extensions", () => {
    expect(fileTypeFromName("evil.exe")).toBeNull();
    expect(fileTypeFromName("pdf")).toBeNull();
    expect(fileTypeFromName("doc.pdf.html")).toBeNull();
  });
});
