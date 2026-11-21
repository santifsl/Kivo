import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The OpenAI key must be read in exactly one place (docs/project.md §9
// "Secrets"). Built at runtime so this file doesn't match itself.
const KEY_ENV = ["OPENAI", "API", "KEY"].join("_");
const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWED = ["lib/openai/client.ts"];
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

describe("OpenAI key isolation", () => {
  it("only lib/openai/client.ts references the OpenAI key variable", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_ROOT)) {
      const path = relative(WEB_ROOT, file).split(sep).join("/");
      if (ALLOWED.includes(path)) continue;
      if ((await readFile(file, "utf8")).includes(KEY_ENV)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("only lib/openai/ imports the openai package", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_ROOT)) {
      const path = relative(WEB_ROOT, file).split(sep).join("/");
      if (path.startsWith("lib/openai/")) continue;
      if (
        /from\s+["']openai(?:\/[^"']*)?["']|import\(\s*["']openai/.test(
          await readFile(file, "utf8"),
        )
      ) {
        offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(["client.ts", "embed.ts"])("lib/openai/%s imports server-only first", async (name) => {
    const source = await readFile(join(WEB_ROOT, "lib/openai", name), "utf8");
    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("client.ts reads the key from the environment", async () => {
    const source = await readFile(join(WEB_ROOT, "lib/openai/client.ts"), "utf8");
    expect(source).toContain(`process.env.${KEY_ENV}`);
  });
});
