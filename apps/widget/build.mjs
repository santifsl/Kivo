// Bundles the widget loader into one file (default: dist/widget.js) and fails
// if it is over the size budget (docs/project.md §3: under 5 kb gzipped).
//
//   node build.mjs                 → apps/widget/dist/widget.js
//   node build.mjs --out <file>    → <file> (relative to the caller's cwd);
//                                    apps/web uses this to serve /widget.js
//   node build.mjs --watch         → rebuild dist/widget.js on change
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const MAX_GZIP_BYTES = 5 * 1024;

const dir = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outfile =
  outIndex === -1 ? resolve(dir, "dist/widget.js") : resolve(process.cwd(), args[outIndex + 1]);

const options = {
  absWorkingDir: dir,
  entryPoints: ["src/index.ts"],
  outfile,
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2018",
  legalComments: "none",
  // The copy in apps/web/public is generated; keep the web app's eslint off it.
  banner: { js: "/* eslint-disable */" },
  logLevel: "info",
};

function checkSize(contents) {
  const bytes = gzipSync(contents, { level: 9 }).length;
  const ok = bytes < MAX_GZIP_BYTES;
  console.log(`widget.js: ${bytes} B gzipped (limit ${MAX_GZIP_BYTES} B)`);
  if (!ok) console.error(`widget.js is over the ${MAX_GZIP_BYTES} B gzip budget.`);
  return ok;
}

if (args.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options); // throws (non-zero exit) on build errors
  if (!checkSize(readFileSync(outfile))) process.exit(1);
}
