import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The Arcjet key is read in exactly one place (docs/project.md §9 "Secrets"),
// and only lib/arcjet talks to the SDK. Built at runtime so this file doesn't
// match itself.
const KEY_ENV = ["ARCJET", "KEY"].join("_");
const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWED = ["lib/arcjet/protect.ts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist"]);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await sourceFiles(join(dir, entry.name))));
    } else if (SOURCE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe("Arcjet key isolation", () => {
  it("only lib/arcjet/protect.ts references the Arcjet key variable", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_ROOT)) {
      const path = relative(WEB_ROOT, file).split(sep).join("/");
      if (ALLOWED.includes(path)) continue;
      if ((await readFile(file, "utf8")).includes(KEY_ENV)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("only lib/arcjet/ imports the Arcjet SDK", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_ROOT)) {
      const path = relative(WEB_ROOT, file).split(sep).join("/");
      if (path.startsWith("lib/arcjet/")) continue;
      if (/["']@arcjet\//.test(await readFile(file, "utf8"))) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("protect.ts imports server-only first and reads the key from the environment", async () => {
    const source = await readFile(join(WEB_ROOT, "lib/arcjet/protect.ts"), "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
    expect(source).toContain(`process.env.${KEY_ENV}`);
  });
});
