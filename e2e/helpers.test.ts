import { describe, expect, it } from "vitest";
import { appOrigin, isPreview, previewOrigin } from "./helpers.ts";

const USAGE = "Usage: test <url>";
const PREVIEW = "https://kivo-git-p6h-t05-core-flow-santifsl.vercel.app";

describe("isPreview", () => {
  it("accepts Kivo Preview hosts", () => {
    expect(isPreview(PREVIEW)).toBe(true);
    expect(isPreview("https://kivo-abc123-santifsl.vercel.app")).toBe(true);
  });

  it("rejects production, other projects, other teams and plain http", () => {
    expect(isPreview("https://kivo.vercel.app")).toBe(false);
    expect(isPreview("https://kivo.example.com")).toBe(false);
    expect(isPreview("https://other-abc-santifsl.vercel.app")).toBe(false);
    expect(isPreview("https://kivo-abc-someone.vercel.app")).toBe(false);
    expect(isPreview("https://kivo-abc-santifsl.vercel.app.evil.com")).toBe(false);
    expect(isPreview("http://kivo-abc-santifsl.vercel.app")).toBe(false);
  });
});

describe("appOrigin", () => {
  it("returns the origin of an https URL", () => {
    expect(appOrigin(`${PREVIEW}/dashboard?x=1`, USAGE)).toBe(PREVIEW);
    expect(appOrigin("https://kivo.example.com/", USAGE)).toBe("https://kivo.example.com");
  });

  it("allows a local dev server over http", () => {
    expect(appOrigin("http://localhost:3000/", USAGE)).toBe("http://localhost:3000");
    expect(appOrigin("http://127.0.0.1:3000", USAGE)).toBe("http://127.0.0.1:3000");
  });

  it("rejects a missing URL, remote http and credentials", () => {
    expect(() => appOrigin(undefined, USAGE)).toThrow(USAGE);
    expect(() => appOrigin("http://kivo.example.com", USAGE)).toThrow(/https/);
    expect(() => appOrigin("https://user:pass@kivo.example.com", USAGE)).toThrow(/credentials/);
  });
});

describe("previewOrigin", () => {
  it("accepts only Kivo Preview URLs without credentials", () => {
    expect(previewOrigin(`${PREVIEW}/x`, USAGE)).toBe(PREVIEW);
    expect(() => previewOrigin("https://kivo.example.com", USAGE)).toThrow(/preview URL/);
    expect(() => previewOrigin(`https://u:p@${new URL(PREVIEW).host}`, USAGE)).toThrow(
      /credentials/,
    );
    expect(() => previewOrigin(undefined, USAGE)).toThrow(USAGE);
  });
});
