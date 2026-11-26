import { readFile } from "node:fs/promises";
import { MAX_EXTRACTED_TEXT_CHARS, MAX_KNOWLEDGE_FILE_BYTES } from "@kivo/shared";
import { describe, expect, it } from "vitest";
import { capText, hasPdfMagic, readUpload, UploadRefusedError, WORD_BREAK_WINDOW } from "./upload";

const fixture = async (name: string) =>
  new Uint8Array(await readFile(new URL(`../../test/fixtures/knowledge/${name}`, import.meta.url)));
const utf8 = (s: string) => new TextEncoder().encode(s);

async function refusal(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UploadRefusedError);
  return (err as Error).message;
}

describe("hasPdfMagic", () => {
  it("is true only for bytes starting with %PDF-", async () => {
    expect(hasPdfMagic(await fixture("sample.pdf"))).toBe(true);
    expect(hasPdfMagic(utf8("%PDF"))).toBe(false);
    expect(hasPdfMagic(utf8(" %PDF-1.4"))).toBe(false);
    expect(hasPdfMagic(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBe(false); // "MZ": a Windows .exe
    expect(hasPdfMagic(new Uint8Array())).toBe(false);
  });
});

describe("readUpload", () => {
  it("returns a real PDF's text", async () => {
    expect((await readUpload(await fixture("sample.pdf"), "pdf")).text).toContain(
      "Refunds are processed",
    );
  });

  it("returns md and txt text", async () => {
    expect((await readUpload(await fixture("sample.md"), "md")).text).toContain("# Shipping");
    expect((await readUpload(await fixture("sample.txt"), "txt")).text).toContain(
      "Plain text FAQ.",
    );
    expect((await readUpload(await fixture("sample.txt"), "txt")).truncated).toBe(false);
  });

  it("refuses a renamed .exe as PDF on its magic bytes", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    expect(await refusal(readUpload(exe, "pdf"))).toBe("The file is not a PDF.");
  });

  it("refuses a renamed .exe as txt (not UTF-8)", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0xff, 0xfe]);
    expect(await refusal(readUpload(exe, "txt"))).toBe("The file is not valid UTF-8 text.");
  });

  it("refuses %PDF- bytes that aren't a readable PDF", async () => {
    expect(await refusal(readUpload(utf8("%PDF-1.4 garbage"), "pdf"))).toBe(
      "The file is not a readable PDF.",
    );
  });

  it("refuses a file over the real size limit before reading it", async () => {
    const big = new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES + 1).fill(0x61);
    expect(await refusal(readUpload(big, "txt"))).toBe("The file is larger than 10 MB.");
  });

  it("accepts a file of exactly the limit, and uses only the first 200,000 characters", async () => {
    const max = new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES).fill(0x61);
    const { text, truncated } = await readUpload(max, "txt");
    expect(truncated).toBe(true);
    expect(text.length).toBe(MAX_EXTRACTED_TEXT_CHARS);
  });

  it("caps after normalization: whitespace runs don't count against the cap", async () => {
    // 200,000 letters split by long runs of spaces: normalized, it's under the cap.
    const words = Array.from({ length: 1000 }, () => "a".repeat(199)).join(" ".repeat(50));
    const { text, truncated } = await readUpload(utf8(words), "txt");
    expect(truncated).toBe(false);
    expect(text.length).toBe(1000 * 199 + 999);
  });

  it("refuses a PDF without text", async () => {
    expect(await refusal(readUpload(await fixture("no-text.pdf"), "pdf"))).toBe(
      "The file has no text we can read.",
    );
  });
});

describe("capText", () => {
  const MAX = MAX_EXTRACTED_TEXT_CHARS;

  it("the cap is 200,000 characters", () => {
    expect(MAX).toBe(200_000);
  });

  it("keeps text of exactly the cap whole", () => {
    const text = `${"a".repeat(MAX - 6)} words`;
    expect(capText(text)).toEqual({ text, truncated: false });
  });

  it("one over the cap: cuts at the last whitespace before it", () => {
    const text = `${"a".repeat(MAX - 6)} words!`;
    expect(text.length).toBe(MAX + 1);
    expect(capText(text)).toEqual({ text: "a".repeat(MAX - 6), truncated: true });
  });

  it("keeps the whole cap when the character just past it is whitespace", () => {
    const text = `${"a".repeat(MAX)}\nmore`;
    expect(capText(text)).toEqual({ text: "a".repeat(MAX), truncated: true });
  });

  it("cuts at a line break, and drops the whitespace before the cut", () => {
    const head = `${"a".repeat(MAX - 10)} \n`;
    const out = capText(`${head}${"b".repeat(20)}`);
    expect(out).toEqual({ text: "a".repeat(MAX - 10), truncated: true });
  });

  it("over the cap with no whitespace: cuts at exactly the cap", () => {
    expect(capText("a".repeat(MAX + 1))).toEqual({ text: "a".repeat(MAX), truncated: true });
  });

  it("with no whitespace, never cuts mid-grapheme", () => {
    // "👍🏽" is 4 code units (2 surrogate pairs); "é" as e + U+0301 is 2. The cap falls inside each.
    const thumbs = "👍🏽";
    const t = capText(`${"a".repeat(MAX - 2)}${thumbs}b`);
    expect(t).toEqual({ text: "a".repeat(MAX - 2), truncated: true });

    const accent = "e\u0301";
    const a = capText(`${"a".repeat(MAX - 1)}${accent}b`);
    expect(a).toEqual({ text: "a".repeat(MAX - 1), truncated: true });
    expect(a.text.endsWith("\u0301")).toBe(false);
  });

  it("ignores a word break far before the cap: a heading then unspaced CJK text keeps its body", () => {
    const text = `Heading\n${"中".repeat(MAX)}`;
    const out = capText(text);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(MAX);
    expect(out.text.startsWith("Heading\n中中")).toBe(true);
  });

  it("uses a word break exactly at the edge of the window, not one just past it", () => {
    const at = `${"a".repeat(MAX - WORD_BREAK_WINDOW)} ${"b".repeat(WORD_BREAK_WINDOW + 5)}`;
    expect(capText(at).text).toBe("a".repeat(MAX - WORD_BREAK_WINDOW));
    const before = `${"a".repeat(MAX - WORD_BREAK_WINDOW - 1)} ${"b".repeat(WORD_BREAK_WINDOW + 5)}`;
    expect(capText(before).text.length).toBe(MAX);
  });

  it("takes any cap", () => {
    expect(capText("one two three", 9)).toEqual({ text: "one two", truncated: true });
    expect(capText("abcdef", 3)).toEqual({ text: "abc", truncated: true });
  });
});
