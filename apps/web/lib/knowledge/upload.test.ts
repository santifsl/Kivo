import { readFile } from "node:fs/promises";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@kivo/shared";
import { describe, expect, it } from "vitest";
import { hasPdfMagic, readUpload, UploadRefusedError } from "./upload";

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
    expect(await readUpload(await fixture("sample.pdf"), "pdf")).toContain("Refunds are processed");
  });

  it("returns md and txt text", async () => {
    expect(await readUpload(await fixture("sample.md"), "md")).toContain("# Shipping");
    expect(await readUpload(await fixture("sample.txt"), "txt")).toContain("Plain text FAQ.");
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

  it("accepts a file of exactly the limit", async () => {
    const max = new Uint8Array(MAX_KNOWLEDGE_FILE_BYTES).fill(0x61);
    expect((await readUpload(max, "txt")).length).toBe(MAX_KNOWLEDGE_FILE_BYTES);
  });

  it("refuses a PDF without text", async () => {
    expect(await refusal(readUpload(await fixture("no-text.pdf"), "pdf"))).toBe(
      "The file has no text we can read.",
    );
  });
});
