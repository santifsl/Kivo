import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The secret key must be read in exactly one place (docs/project.md §9
// "Secrets"). Built at runtime so this file doesn't match itself.
const SECRET_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWED = ["lib/supabase/service.ts"];
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

describe("secret key isolation", () => {
  it("only lib/supabase/service.ts references the secret key variable", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_ROOT)) {
      const path = relative(WEB_ROOT, file).split(sep).join("/");
      if (ALLOWED.includes(path)) continue;
      if ((await readFile(file, "utf8")).includes(SECRET_ENV)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it("service.ts reads it and imports server-only first", async () => {
    const service = await readFile(join(WEB_ROOT, "lib/supabase/service.ts"), "utf8");
    expect(service).toContain(`process.env.${SECRET_ENV}`);
    expect(service.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});
