// @vitest-environment node
// docs/project.md §3: the loader stays under 5 kb minified + gzipped.
// Plain .mjs so Node types stay out of the browser code's typecheck.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";

it("widget.js is under 5 kb gzipped", () => {
  const out = join(mkdtempSync(join(tmpdir(), "widget-")), "widget.js");
  // Same build as production; build.mjs itself also fails above the limit.
  const build = fileURLToPath(new URL("../build.mjs", import.meta.url));
  execFileSync(process.execPath, [build, "--out", out], { stdio: "pipe" });
  const bytes = gzipSync(readFileSync(out), { level: 9 }).length;
  expect(bytes).toBeLessThan(5 * 1024);
});
