import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ExtractError, extractText, normalizeText } from "./extract";

const fixture = async (name: string) =>
  new Uint8Array(await readFile(new URL(`../../test/fixtures/knowledge/${name}`, import.meta.url)));
const utf8 = (s: string) => new TextEncoder().encode(s);

async function extractError(promise: Promise<unknown>): Promise<ExtractError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ExtractError);
  return error as ExtractError;
}

describe("extractText", () => {
  it("extracts the text of every page of a PDF", async () => {
    expect(await extractText(await fixture("sample.pdf"), "pdf")).toBe(
      "Askwell support guide\nOur office opens at 9am on weekdays.\n\n" +
        "Refunds are processed within 5 business days.",
    );
  });

  it("reads Markdown as UTF-8 and normalizes whitespace", async () => {
    expect(await extractText(await fixture("sample.md"), "md")).toBe(
      "# Shipping\n\nWe ship to **Canada** and the US.\n\n## Returns\n\n" +
        "Returns are free for 30 days. Café hours: 9–5 ☕",
    );
  });

  it("reads TXT as UTF-8, dropping the BOM", async () => {
    expect(await extractText(await fixture("sample.txt"), "txt")).toBe(
      "Plain text FAQ.\nTabs and spaces collapse.",
    );
  });

  it.each([
    ["a lone continuation byte", [0x48, 0x69, 0x80]],
    ["a truncated sequence", [0x63, 0x61, 0x66, 0xc3]],
    ["an overlong encoding", [0xc0, 0xaf]],
    ["a UTF-16 surrogate", [0xed, 0xa0, 0x80]],
  ])("rejects invalid UTF-8: %s", async (_, bytes) => {
    for (const type of ["md", "txt"] as const) {
      const error = await extractError(extractText(new Uint8Array(bytes), type));
      expect(error.code).toBe("invalid_utf8");
    }
  });

  it.each([
    ["an empty file", new Uint8Array()],
    ["whitespace only", utf8(" \n\r\n\t ")],
    ["control characters only", utf8("\u0000\u0001\u001f")],
  ])("gives a no_text error for %s", async (_, bytes) => {
    const error = await extractError(extractText(bytes, "txt"));
    expect(error.code).toBe("no_text");
    expect(error.message).toBe("The file has no text we can read.");
  });

  it("gives a no_text error for a PDF without text", async () => {
    const error = await extractError(extractText(await fixture("no-text.pdf"), "pdf"));
    expect(error.code).toBe("no_text");
  });

  it("gives an invalid_pdf error for bytes that aren't a PDF", async () => {
    const error = await extractError(extractText(utf8("not a pdf"), "pdf"));
    expect(error.code).toBe("invalid_pdf");
  });

  it("leaves the caller's bytes usable", async () => {
    const bytes = await fixture("sample.pdf");
    await extractText(bytes, "pdf");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});

describe("normalizeText", () => {
  it("normalizes line endings, spaces, blank lines and NUL", () => {
    expect(normalizeText("  a\r\nb\rc\u0000d  \t e\n\n\n\n f \f g ")).toBe("a\nb\ncd e\n\nf\ng");
  });

  it("applies NFC", () => {
    expect(normalizeText("Café")).toBe("Café");
  });
});
